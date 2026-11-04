import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

const AUDIO_EXTS = new Set(['.ogg', '.wav', '.mp3', '.m4a', '.aac', '.flac'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi'])

export type FileType = 'audio' | 'video' | 'unknown'

/**
 * Detects file type by extension
 */
export function detectFileType(filePath: string): FileType {
  const ext = path.extname(filePath).toLowerCase()
  
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'unknown'
}

/**
 * Lists audio/video files in directory
 */
export function listMediaFiles(dir: string): Array<{ name: string; fullPath: string; type: FileType }> {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => {
        const fullPath = path.join(dir, name)
        try {
          return fs.statSync(fullPath).isFile()
        } catch {
          return false
        }
      })
      .map((name) => {
        const fullPath = path.join(dir, name)
        return {
          name,
          fullPath,
          type: detectFileType(name)
        }
      })
      .filter((f) => f.type !== 'unknown')
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Error listing files:', error)
    return []
  }
}

/**
 * Max UTF-8 bytes of a name derived from a source file (or user text) before
 * it gets suffixes/prefixes appended. Filesystems cap a single name at 255
 * (bytes on ext4/APFS, UTF-16 chars on NTFS), and Windows additionally caps the
 * whole path at 260 — outputs add a datetime stamp, `_converted`/`.legenda.txt`
 * style suffixes and `_N` de-duplication on top of this, and run folders nest a
 * second derived name inside the first, so the budget is deliberately small.
 */
export const MAX_BASE_NAME_BYTES = 64

/** Hard ceiling for any final name stem (base + suffixes), used as a last-resort guard. */
export const MAX_STEM_BYTES = 180

function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  let out = ''
  let bytes = 0
  // for..of iterates code points, so surrogate pairs / multi-byte chars are never split.
  for (const char of text) {
    const size = Buffer.byteLength(char, 'utf8')
    if (bytes + size > maxBytes) break
    out += char
    bytes += size
  }
  return out
}

/**
 * Shortens a file-name stem so it can never blow the filesystem's name limit.
 * Names that fit are returned untouched; longer ones are cut on a character
 * boundary and get a short hash of the full original appended, so two long
 * names sharing the same prefix still map to different outputs.
 */
export function limitFileNameLength(name: string, maxBytes: number = MAX_BASE_NAME_BYTES): string {
  if (Buffer.byteLength(name, 'utf8') <= maxBytes) return name

  const hash = createHash('sha1').update(name).digest('hex').slice(0, 8)
  const head = truncateToBytes(name, Math.max(1, maxBytes - hash.length - 1)).replace(/[\s._-]+$/, '')
  return head ? `${head}_${hash}` : hash
}

/** Base name (no directory, no extension) of `filePath`, safe to derive output names from. */
export function getSafeBaseName(filePath: string): string {
  return limitFileNameLength(path.basename(filePath, path.extname(filePath)))
}

/**
 * Creates (if needed) and returns a folder named after `inputFile`'s basename,
 * used to group every output generated for that file (audio, subtitles, clips,
 * thumbnails, etc.) instead of scattering them next to the original file.
 */
export function createOutputFolderForFile(inputFile: string, baseOutputDir?: string): string {
  const parentDir = baseOutputDir || path.dirname(inputFile)
  const folderName = getSafeBaseName(inputFile)
  const dir = path.join(parentDir, folderName)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Converts free text (e.g. an AI-generated clip title) into a filesystem-safe
 * slug, used to name per-clip output folders.
 */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return slug || 'clip'
}

/**
 * Checks if a file exists
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

/**
 * Gets file size in bytes
 */
export function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath)
    return stats.size
  } catch (error) {
    console.error('Error getting file size:', error)
    return 0
  }
}

/**
 * Converts bytes to MB
 */
export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024)
}
