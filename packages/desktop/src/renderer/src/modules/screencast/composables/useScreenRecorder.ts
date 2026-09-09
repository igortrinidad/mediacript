import { reactive, readonly } from 'vue'
import type { CameraBubbleOptions, ScreenSource, ScreencastQualityPreset } from '@shared/types'
import { DEFAULT_CAMERA_BUBBLE, drawCameraBubble } from './cameraBubble'

export interface RecordingDeviceOption {
  deviceId: string
  label: string
}

export interface StartRecordingOptions {
  sourceId: string
  cameraDeviceId?: string
  micDeviceId?: string
  cameraBubble?: CameraBubbleOptions
  qualityPreset?: ScreencastQualityPreset
}

/**
 * Desktop capture is uncapped by default only in theory — without explicit
 * `mandatory` max dimensions Chromium hands back a downscaled ~720p stream, so
 * the capture is pinned to the display's real size up to this ceiling. The cap
 * sits at 1440p on purpose: the optimized output tops out at 1080p, so grabbing
 * a 4K desktop natively would only burn realtime VP9 encoding budget (and drop
 * frames) for detail the downscale throws away anyway.
 */
const CAPTURE_MAX_WIDTH = 2560
const CAPTURE_MAX_HEIGHT = 1440
const CAPTURE_FPS = 30

/**
 * Bits per pixel per frame for the intermediate .webm. This file is temporary —
 * ffmpeg re-encodes it to the final mp4 — so it's budgeted to be visually
 * lossless rather than small: MediaRecorder's own default (~2.5 Mbps) is what
 * turns scrolling text to mush at 1080p.
 */
const INTERMEDIATE_BITS_PER_PIXEL = 0.12
const MIN_INTERMEDIATE_BPS = 8_000_000
const MAX_INTERMEDIATE_BPS = 20_000_000

/** Ordered by preference — the first one this Chromium build can encode wins. */
const RECORDER_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
]

function pickMimeType(): string | undefined {
  return RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

function intermediateVideoBitrate(width: number, height: number): number {
  const raw = width * height * CAPTURE_FPS * INTERMEDIATE_BITS_PER_PIXEL
  return Math.round(Math.min(MAX_INTERMEDIATE_BPS, Math.max(MIN_INTERMEDIATE_BPS, raw)))
}

/**
 * Plays a stream into an offscreen `<video>` and waits until its intrinsic
 * dimensions are known. `play()` alone can resolve while `videoWidth` is still
 * 0, which would size the canvas — and therefore the recording — to nothing.
 */
async function playStream(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  await video.play()

  if (!video.videoWidth || !video.videoHeight) {
    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
    })
  }

  return video
}

type RecorderPhase = 'idle' | 'recording' | 'paused' | 'converting'

const state = reactive({
  phase: 'idle' as RecorderPhase,
  elapsedSeconds: 0,
  // Set when a recording finishes saving — the flow watches this so it can
  // advance to processing even when stop is triggered from the floating
  // control window (which bypasses ScreencastFlow.stopRecording).
  rawFilePath: null as string | null
})

let screenStream: MediaStream | null = null
let cameraStream: MediaStream | null = null
let micStream: MediaStream | null = null
let canvasStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let chunks: Blob[] = []
let rafHandle: number | null = null
let timerHandle: ReturnType<typeof setInterval> | null = null
let unsubscribeControlAction: (() => void) | null = null
let resolveStop: ((rawFilePath: string) => void) | null = null

async function listScreenSources(): Promise<ScreenSource[]> {
  return window.api.screencast.listSources()
}

async function listMediaDevices(): Promise<{ cameras: RecordingDeviceOption[]; mics: RecordingDeviceOption[] }> {
  // Labels are blank until permission has been granted at least once —
  // request a throwaway stream first so the picker shows real device names.
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    probe.getTracks().forEach((track) => track.stop())
  } catch {
    // User may deny one or both — device lists still work, just unlabeled.
  }

  const devices = await navigator.mediaDevices.enumerateDevices()
  const cameras = devices
    .filter((d) => d.kind === 'videoinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Câmera' }))
  const mics = devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Microfone' }))

  return { cameras, mics }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  screenVideo: HTMLVideoElement,
  cameraVideo: HTMLVideoElement | null,
  bubble: CameraBubbleOptions
): void {
  ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height)

  if (cameraVideo) {
    drawCameraBubble(
      ctx,
      canvas.width,
      canvas.height,
      cameraVideo,
      cameraVideo.videoWidth,
      cameraVideo.videoHeight,
      bubble
    )
  }
}

async function startRecording(options: StartRecordingOptions): Promise<void> {
  screenStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // @ts-expect-error Electron-specific desktopCapturer constraints, not in the standard lib.dom types.
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: options.sourceId,
        maxWidth: CAPTURE_MAX_WIDTH,
        maxHeight: CAPTURE_MAX_HEIGHT,
        maxFrameRate: CAPTURE_FPS
      }
    }
  })

  cameraStream = options.cameraDeviceId
    ? await navigator.mediaDevices.getUserMedia({
        // The bubble center-crops to a square and then downscales, so a 480p
        // webcam default would land visibly soft next to a 1080p screen.
        video: {
          deviceId: { exact: options.cameraDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: CAPTURE_FPS }
        }
      })
    : null

  micStream = options.micDeviceId
    ? await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: options.micDeviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        }
      })
    : null

  const screenVideo = await playStream(screenStream)
  const cameraVideo = cameraStream ? await playStream(cameraStream) : null

  const canvas = document.createElement('canvas')
  canvas.width = screenVideo.videoWidth
  canvas.height = screenVideo.videoHeight
  // The composite is fully opaque (the screen frame covers every pixel), so
  // alpha only costs blending work; smoothing quality matters for the camera
  // bubble, which is the one thing here that gets downscaled while drawing.
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const bubble = options.cameraBubble ?? DEFAULT_CAMERA_BUBBLE

  // rAF fires at the display's refresh rate (often 60/120Hz). Repainting a
  // 1440p canvas that often just to feed a 30fps capture starves the encoder,
  // so the composite is throttled to the capture rate.
  const frameInterval = 1000 / CAPTURE_FPS
  let lastFrameAt = 0
  const loop = (now: number): void => {
    if (now - lastFrameAt >= frameInterval) {
      lastFrameAt = now
      drawFrame(ctx, canvas, screenVideo, cameraVideo, bubble)
    }
    rafHandle = requestAnimationFrame(loop)
  }
  rafHandle = requestAnimationFrame(loop)

  canvasStream = canvas.captureStream(CAPTURE_FPS)
  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()]
  if (micStream) tracks.push(...micStream.getAudioTracks())

  const combinedStream = new MediaStream(tracks)
  mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType: pickMimeType(),
    videoBitsPerSecond: intermediateVideoBitrate(canvas.width, canvas.height),
    audioBitsPerSecond: 128_000
  })
  chunks = []
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  // A timeslice flushes chunks as the recording runs instead of holding one
  // growing buffer — at these bitrates a long recording would otherwise pin
  // hundreds of MB in the renderer's heap.
  mediaRecorder.start(2000)
  state.phase = 'recording'
  state.elapsedSeconds = 0
  timerHandle = setInterval(() => {
    if (state.phase === 'recording') state.elapsedSeconds++
  }, 1000)

  unsubscribeControlAction = window.api.screencast.onControlAction((action) => {
    if (action === 'pause') pause()
    else if (action === 'resume') resume()
    else if (action === 'stop') void stop()
    else if (action === 'cancel') void cancel()
  })

  await window.api.screencast.openControlWindow({
    micEnabled: !!micStream,
    cameraEnabled: !!cameraStream
  })
}

function pause(): void {
  if (mediaRecorder?.state !== 'recording') return
  mediaRecorder.pause()
  state.phase = 'paused'
}

function resume(): void {
  if (mediaRecorder?.state !== 'paused') return
  mediaRecorder.resume()
  state.phase = 'recording'
}

async function stop(): Promise<string> {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    throw new Error('Nenhuma gravação em andamento')
  }

  const rawFilePath = await new Promise<string>((resolve) => {
    resolveStop = resolve
    mediaRecorder!.onstop = async () => {
      cleanupStreams()

      const blob = new Blob(chunks, { type: 'video/webm' })
      const arrayBuffer = await blob.arrayBuffer()
      const filePath = await window.api.screencast.saveRawRecording(arrayBuffer)
      resolveStop?.(filePath)
      resolveStop = null
    }
    mediaRecorder!.stop()
  })

  state.rawFilePath = rawFilePath
  state.phase = 'converting'
  await window.api.screencast.closeControlWindow()
  return rawFilePath
}

/** Stops recording and discards everything captured so far — no save, no processing. */
async function cancel(): Promise<void> {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    await new Promise<void>((resolve) => {
      mediaRecorder!.onstop = () => resolve()
      mediaRecorder!.stop()
    })
  }
  chunks = []
  cleanupStreams()
  reset()
  await window.api.screencast.closeControlWindow()
}

function cleanupStreams(): void {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle)
    rafHandle = null
  }
  if (timerHandle !== null) {
    clearInterval(timerHandle)
    timerHandle = null
  }
  unsubscribeControlAction?.()
  unsubscribeControlAction = null

  for (const stream of [screenStream, cameraStream, micStream, canvasStream]) {
    stream?.getTracks().forEach((track) => track.stop())
  }
  screenStream = null
  cameraStream = null
  micStream = null
  canvasStream = null
  mediaRecorder = null
}

function reset(): void {
  state.phase = 'idle'
  state.elapsedSeconds = 0
  state.rawFilePath = null
}

export function useScreenRecorder() {
  return {
    state: readonly(state),
    listScreenSources,
    listMediaDevices,
    startRecording,
    pause,
    resume,
    stop,
    cancel,
    reset
  }
}
