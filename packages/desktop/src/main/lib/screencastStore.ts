import fs from 'fs'
import path from 'path'
import { getConfigDirectory } from 'mediacript'
import { createRunStamp, getFeatureOutputDir } from './outputPaths'
import type { ScreencastPreferences } from '../../shared/types'

export function getRecordingsDir(): string {
  return getFeatureOutputDir('screencast')
}

function getPreferencesFilePath(): string {
  return path.join(getConfigDirectory(), 'screencast-preferences.json')
}

/**
 * Reads the saved setup (devices, camera bubble, quality) so the user doesn't
 * have to redo it before every recording. Returns whatever is on disk without
 * filling in defaults — the setup step owns those, and merging here would mean
 * keeping a second copy of `DEFAULT_CAMERA_BUBBLE` in sync.
 */
export function getScreencastPreferences(): Partial<ScreencastPreferences> | null {
  try {
    const filePath = getPreferencesFilePath()
    if (!fs.existsSync(filePath)) return null
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as Partial<ScreencastPreferences>) : null
  } catch (error) {
    console.error('Error reading screencast preferences:', error)
    return null
  }
}

export function saveScreencastPreferences(preferences: ScreencastPreferences): void {
  try {
    const configDir = getConfigDirectory()
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(getPreferencesFilePath(), JSON.stringify(preferences, null, 2), 'utf-8')
  } catch (error) {
    console.error('Error saving screencast preferences:', error)
  }
}

// --- Incremental recording writer --------------------------------------------

/**
 * The recording is appended to disk as MediaRecorder produces chunks instead of
 * being held in the renderer and shipped over IPC in one piece on stop — a long
 * recording at these bitrates is gigabytes, which blows past what a single IPC
 * message / Blob can carry. It also means a crash or a failed stop still leaves
 * the raw .webm in the recordings folder.
 */
let activeWriter: { filePath: string; stream: fs.WriteStream } | null = null

/** Opens the raw file for a new recording and returns its path. */
export function beginRawRecording(): string {
  if (activeWriter) {
    activeWriter.stream.end()
    activeWriter = null
  }
  const filePath = path.join(getRecordingsDir(), `${createRunStamp()}_screencast.webm`)
  activeWriter = { filePath, stream: fs.createWriteStream(filePath) }
  return filePath
}

export function appendRawRecordingChunk(chunk: Buffer): void {
  activeWriter?.stream.write(chunk)
}

/** Flushes and closes the raw file. Pass `discard` to delete it (cancelled recordings). */
export async function finishRawRecording(discard = false): Promise<string | null> {
  const writer = activeWriter
  if (!writer) return null
  activeWriter = null

  await new Promise<void>((resolve) => writer.stream.end(() => resolve()))
  if (discard) {
    fs.rmSync(writer.filePath, { force: true })
    return null
  }
  return writer.filePath
}
