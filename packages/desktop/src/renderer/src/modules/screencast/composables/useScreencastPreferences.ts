import type {
  CameraBubbleCorner,
  CameraBubbleOptions,
  CameraBubbleShape,
  ScreencastDevicePreference,
  ScreencastPreferences,
  ScreencastQualityPreset
} from '@shared/types'
import { toPlain } from '../../../shared/toPlain'
import { DEFAULT_CAMERA_BUBBLE } from './cameraBubble'
import type { RecordingDeviceOption } from './useScreenRecorder'

function defaultPreferences(): ScreencastPreferences {
  return {
    cameraEnabled: false,
    micEnabled: false,
    camera: null,
    mic: null,
    cameraBubble: { ...DEFAULT_CAMERA_BUBBLE },
    qualityPreset: 'whatsapp',
    previewEnabled: false
  }
}

const CORNERS: CameraBubbleCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const SHAPES: CameraBubbleShape[] = ['circle', 'rounded', 'square']
const QUALITY_PRESETS: ScreencastQualityPreset[] = ['whatsapp', 'balanced', 'high']

function pickFrom<T extends string>(options: T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function normalizeDevice(stored: unknown): ScreencastDevicePreference | null {
  const device = stored as Partial<ScreencastDevicePreference> | null | undefined
  if (!device || typeof device.deviceId !== 'string' || !device.deviceId) return null
  return { deviceId: device.deviceId, label: typeof device.label === 'string' ? device.label : '' }
}

function normalizeBubble(stored: Partial<CameraBubbleOptions> | undefined): CameraBubbleOptions {
  const bubble = stored ?? {}
  return {
    corner: pickFrom(CORNERS, bubble.corner, DEFAULT_CAMERA_BUBBLE.corner),
    shape: pickFrom(SHAPES, bubble.shape, DEFAULT_CAMERA_BUBBLE.shape),
    sizeRatio: clampNumber(bubble.sizeRatio, 0.08, 0.35, DEFAULT_CAMERA_BUBBLE.sizeRatio),
    borderWidth: clampNumber(bubble.borderWidth, 0, 10, DEFAULT_CAMERA_BUBBLE.borderWidth),
    borderColor:
      typeof bubble.borderColor === 'string' && /^#[0-9a-f]{6}$/i.test(bubble.borderColor)
        ? bubble.borderColor
        : DEFAULT_CAMERA_BUBBLE.borderColor
  }
}

/**
 * Reads the saved setup, filling in defaults for anything missing or out of
 * range — the file is user-editable and can have been written by an older
 * build, so nothing in it is trusted to have the current shape.
 */
export async function loadScreencastPreferences(): Promise<ScreencastPreferences> {
  const stored = await window.api.screencast.getPreferences()
  if (!stored) return defaultPreferences()

  return {
    cameraEnabled: stored.cameraEnabled === true,
    micEnabled: stored.micEnabled === true,
    camera: normalizeDevice(stored.camera),
    mic: normalizeDevice(stored.mic),
    cameraBubble: normalizeBubble(stored.cameraBubble),
    qualityPreset: pickFrom(QUALITY_PRESETS, stored.qualityPreset, 'whatsapp'),
    previewEnabled: stored.previewEnabled === true
  }
}

export async function saveScreencastPreferences(preferences: ScreencastPreferences): Promise<void> {
  await window.api.screencast.savePreferences(toPlain(preferences))
}

/**
 * Matches a remembered device against what's plugged in right now. Device ids
 * are the primary key, but Chromium reissues them when a device is replugged
 * or its permission salt changes, so the stored label is tried next before
 * falling back to whatever the OS lists first.
 */
export function resolveDeviceId(
  devices: RecordingDeviceOption[],
  preference: ScreencastDevicePreference | null
): string {
  if (preference?.deviceId && devices.some((device) => device.deviceId === preference.deviceId)) {
    return preference.deviceId
  }
  if (preference?.label) {
    const byLabel = devices.find((device) => device.label === preference.label)
    if (byLabel) return byLabel.deviceId
  }
  return devices[0]?.deviceId ?? ''
}

export function toDevicePreference(
  devices: RecordingDeviceOption[],
  deviceId: string
): ScreencastDevicePreference | null {
  if (!deviceId) return null
  return { deviceId, label: devices.find((device) => device.deviceId === deviceId)?.label ?? '' }
}
