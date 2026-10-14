import { reactive, readonly } from 'vue'
import type { MeetingCreateRequest, MeetingTrack } from '@shared/types'
import { toPlain } from '../../../shared/toPlain'
import { captureSystemAudio, isMonitorDevice } from '../../../shared/systemAudio'

export interface AudioDeviceOption {
  deviceId: string
  label: string
  /** Inputs that mirror the system output (PulseAudio monitors, Stereo Mix, BlackHole, VB-Cable, ...). */
  isMonitor: boolean
}

type RecorderPhase = 'idle' | 'recording' | 'paused' | 'stopping'

const state = reactive({
  phase: 'idle' as RecorderPhase,
  elapsedSeconds: 0,
  meetingId: null as string | null,
  micActive: false,
  systemActive: false,
  /**
   * Set once a recording is stopped and saved. The flow watches this so it can
   * move on to processing even when stop was triggered from the floating
   * control window instead of the in-app button.
   */
  finishedMeetingId: null as string | null
})

/**
 * How often MediaRecorder hands us data. Every chunk is written straight to
 * disk, so this is also the most audio a crash can cost — five seconds.
 */
const CHUNK_MS = 5000

/** Speech-only, mono: 32kbps Opus is transparent enough for transcription and keeps a 2h meeting small. */
const AUDIO_BITS_PER_SECOND = 32000

let micStream: MediaStream | null = null
let systemStream: MediaStream | null = null
let recorders: { track: MeetingTrack; recorder: MediaRecorder }[] = []
let timerHandle: ReturnType<typeof setInterval> | null = null
let unsubscribeControlAction: (() => void) | null = null

/**
 * Serializes the writes per track. `Blob.arrayBuffer()` is async, so firing the
 * IPC straight from `ondataavailable` could interleave two chunks and corrupt
 * the WebM stream — each track's chunks must reach the main process in the
 * exact order the recorder produced them.
 */
let writeQueues: Record<MeetingTrack, Promise<void>> = { mic: Promise.resolve(), system: Promise.resolve() }

export async function listAudioInputs(): Promise<AudioDeviceOption[]> {
  // Device labels stay blank until mic permission has been granted once.
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
    probe.getTracks().forEach((track) => track.stop())
  } catch {
    // Denied — the list still works, just without readable labels.
  }

  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || 'Entrada de áudio',
      isMonitor: isMonitorDevice(device.label)
    }))
}

async function captureMic(deviceId?: string): Promise<MediaStream | null> {
  if (!deviceId) return null
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      // Meeting apps already process the near-end audio; a second pass of AGC
      // here mostly pumps background noise up between sentences.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })
}

function startTrackRecorder(meetingId: string, track: MeetingTrack, stream: MediaStream): MediaRecorder {
  const recorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND
  })

  recorder.ondataavailable = (event) => {
    if (!event.data.size) return
    writeQueues[track] = writeQueues[track].then(async () => {
      const buffer = await event.data.arrayBuffer()
      window.api.meetings.appendChunk(meetingId, track, buffer)
    })
  }

  recorder.start(CHUNK_MS)
  return recorder
}

export async function startRecording(request: MeetingCreateRequest): Promise<void> {
  micStream = await captureMic(request.setup.micDeviceId)

  try {
    systemStream = await captureSystemAudio(request.setup.systemAudioMode, request.setup.systemAudioDeviceId)
  } catch (error) {
    micStream?.getTracks().forEach((track) => track.stop())
    micStream = null
    throw error
  }

  if (!micStream && !systemStream) {
    throw new Error('Selecione pelo menos uma fonte de áudio (microfone ou som do sistema).')
  }

  const meetingId = await window.api.meetings.create(toPlain(request))
  writeQueues = { mic: Promise.resolve(), system: Promise.resolve() }
  recorders = []

  if (micStream) recorders.push({ track: 'mic', recorder: startTrackRecorder(meetingId, 'mic', micStream) })
  if (systemStream) {
    recorders.push({ track: 'system', recorder: startTrackRecorder(meetingId, 'system', systemStream) })
  }

  state.meetingId = meetingId
  state.finishedMeetingId = null
  state.phase = 'recording'
  state.elapsedSeconds = 0
  state.micActive = !!micStream
  state.systemActive = !!systemStream

  timerHandle = setInterval(() => {
    if (state.phase === 'recording') state.elapsedSeconds++
  }, 1000)

  unsubscribeControlAction = window.api.meetings.onControlAction((action) => {
    if (action === 'pause') pause()
    else if (action === 'resume') resume()
    else if (action === 'stop') void stop()
    else if (action === 'cancel') void cancel()
  })

  await window.api.meetings.openControlWindow({
    micEnabled: !!micStream,
    systemAudioEnabled: !!systemStream
  })
}

export function pause(): void {
  if (state.phase !== 'recording') return
  recorders.forEach(({ recorder }) => recorder.state === 'recording' && recorder.pause())
  state.phase = 'paused'
}

export function resume(): void {
  if (state.phase !== 'paused') return
  recorders.forEach(({ recorder }) => recorder.state === 'paused' && recorder.resume())
  state.phase = 'recording'
}

/** Stops every recorder and waits for each one's final chunk to be flushed. */
async function stopRecorders(): Promise<void> {
  await Promise.all(
    recorders.map(
      ({ recorder }) =>
        new Promise<void>((resolve) => {
          if (recorder.state === 'inactive') {
            resolve()
            return
          }
          recorder.onstop = () => resolve()
          recorder.stop()
        })
    )
  )

  // The last `ondataavailable` fires just before `onstop`, so its queued write
  // may still be in flight — wait for both tracks to drain before the main
  // process closes the files.
  await Promise.all([writeQueues.mic, writeQueues.system])
}

function cleanup(): void {
  if (timerHandle !== null) {
    clearInterval(timerHandle)
    timerHandle = null
  }
  unsubscribeControlAction?.()
  unsubscribeControlAction = null

  for (const stream of [micStream, systemStream]) {
    stream?.getTracks().forEach((track) => track.stop())
  }
  micStream = null
  systemStream = null
  recorders = []
}

export async function stop(): Promise<string> {
  const meetingId = state.meetingId
  if (!meetingId) throw new Error('Nenhuma reunião em gravação')

  state.phase = 'stopping'
  await stopRecorders()
  cleanup()

  await window.api.meetings.finishRecording(meetingId, state.elapsedSeconds)
  await window.api.meetings.closeControlWindow()

  state.finishedMeetingId = meetingId
  state.phase = 'idle'
  return meetingId
}

/** Stops and discards everything recorded so far — audio files included. */
export async function cancel(): Promise<void> {
  const meetingId = state.meetingId

  await stopRecorders()
  cleanup()

  if (meetingId) await window.api.meetings.cancel(meetingId)
  await window.api.meetings.closeControlWindow()

  reset()
}

export function reset(): void {
  state.phase = 'idle'
  state.elapsedSeconds = 0
  state.meetingId = null
  state.finishedMeetingId = null
  state.micActive = false
  state.systemActive = false
}

export function useMeetingRecorder() {
  return {
    state: readonly(state),
    listAudioInputs,
    startRecording,
    pause,
    resume,
    stop,
    cancel,
    reset
  }
}
