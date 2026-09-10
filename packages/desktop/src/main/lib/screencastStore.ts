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

/** Saves a raw recording buffer to a datetime-named file in the recordings folder and returns its path. */
export function saveRawRecording(buffer: Buffer): string {
  const filePath = path.join(getRecordingsDir(), `${createRunStamp()}_screencast.webm`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}
