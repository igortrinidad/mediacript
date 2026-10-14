import type { SystemAudioMode } from '@shared/types'

const MONITOR_DEVICE_PATTERN = /monitor|stereo mix|mixagem est|blackhole|loopback|soundflower|vb-audio|cable output|what u hear/i

/** Inputs that mirror the system output (PulseAudio monitors, Stereo Mix, BlackHole, VB-Cable, ...). */
export function isMonitorDevice(label: string): boolean {
  return MONITOR_DEVICE_PATTERN.test(label)
}

/**
 * Captures whatever comes out of the speakers. Returns null when the mode is
 * `none` (or `device` without a device picked), so callers can treat "no system
 * audio" as an ordinary outcome rather than an error.
 */
export async function captureSystemAudio(
  mode: SystemAudioMode,
  deviceId?: string
): Promise<MediaStream | null> {
  if (mode === 'none') return null

  if (mode === 'device') {
    if (!deviceId) return null
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        // This is already a clean digital copy of the output — any "cleanup"
        // here would only chew holes in it.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
  }

  // Loopback: the main process answers this request with the screen plus a
  // system-audio track. Video is requested only because Chromium won't give up
  // desktop audio on its own — it's dropped as soon as the stream arrives.
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  for (const track of display.getVideoTracks()) {
    track.stop()
    display.removeTrack(track)
  }

  if (!display.getAudioTracks().length) {
    throw new Error(
      'O sistema não entregou o áudio da saída. No Windows verifique se há um dispositivo de reprodução ativo; em outros sistemas use a opção de dispositivo (monitor/cabo virtual).'
    )
  }

  return display
}
