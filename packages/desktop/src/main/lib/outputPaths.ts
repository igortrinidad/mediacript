import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getStoredConfig } from 'mediacript'

/**
 * Every file the app generates lands under one predictable root, split by the
 * module that produced it:
 *
 *   <Documentos>/Mediacript/<Funcionalidade>/<datetime>_<nome>.<ext>
 *
 * The root is the same shape on macOS and Windows (`app.getPath('documents')`
 * resolves to ~/Documents and C:\Users\<user>\Documents respectively) and can
 * be pointed somewhere else by the user in Settings › Geral — `defaultOutputDir`
 * replaces only the root, the per-module folders and the datetime naming stay.
 */
export type OutputFeature = 'convert' | 'compress' | 'subtitle' | 'highlights' | 'meetings' | 'screencast' | 'ads' | 'instagram'

const FEATURE_FOLDERS: Record<OutputFeature, string> = {
  convert: 'Convert',
  compress: 'Compress',
  subtitle: 'Subtitle',
  highlights: 'Highlights',
  meetings: 'Meetings',
  screencast: 'Screencast',
  ads: 'Ads',
  instagram: 'Instagram'
}

/** Folder created inside the user's Documents when no custom root is configured. */
export const OUTPUT_ROOT_FOLDER_NAME = 'Mediacript'

/** `2026-09-09_14-32-05` — local time, lexicographically sortable, filesystem-safe on both platforms. */
const STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_/

export function getDefaultOutputRoot(): string {
  return path.join(app.getPath('documents'), OUTPUT_ROOT_FOLDER_NAME)
}

/** The configured root, or the Documents/Mediacript default when the user hasn't picked one. */
export function getOutputRoot(): string {
  const configured = getStoredConfig().defaultOutputDir?.trim()
  return configured ? configured : getDefaultOutputRoot()
}

/** Creates (if needed) and returns `<root>/<Funcionalidade>`. */
export function getFeatureOutputDir(feature: OutputFeature): string {
  const dir = path.join(getOutputRoot(), FEATURE_FOLDERS[feature])
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Timestamp prefix shared by every file/folder of a single run. */
export function createRunStamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  return `${day}_${time}`
}

function uniquePath(dir: string, baseName: string, extWithDot: string): string {
  let candidate = path.join(dir, `${baseName}${extWithDot}`)
  if (!fs.existsSync(candidate)) return candidate

  for (let i = 1; i < 10_000; i++) {
    candidate = path.join(dir, `${baseName}_${i}${extWithDot}`)
    if (!fs.existsSync(candidate)) return candidate
  }

  throw new Error('Não foi possível gerar um nome de arquivo único na pasta de saída.')
}

function moveFile(from: string, to: string): void {
  try {
    fs.renameSync(from, to)
  } catch (error: any) {
    // rename() can't cross filesystems (EXDEV) — the source may sit on another
    // drive/volume than the output root the user picked.
    if (error?.code !== 'EXDEV') throw error
    fs.copyFileSync(from, to)
    fs.unlinkSync(from)
  }
}

/**
 * Puts a file mediacript just produced where this app wants it: inside `dir`,
 * named after the run.
 *
 * mediacript names outputs after their input (`video_converted.mp4`,
 * `video_audio.mp3`, ...) and a few of its helpers write next to that input
 * rather than into the requested output dir — meaningful names, but they
 * collide (and scatter) once every run of every file shares one folder. So the
 * file is moved into `dir` with the run's datetime prefix:
 * `2026-09-09_14-32-05_video_converted.mp4`.
 *
 * Pass no `stamp` for grouped runs, whose folder already carries the datetime.
 * Stamping is idempotent: a file whose name already starts with one (a chained
 * step whose input was itself a stamped output) keeps it instead of
 * accumulating a prefix per step.
 */
export function moveOutputInto(producedPath: string, dir: string, stamp?: string): string {
  const name = path.basename(producedPath)
  const ext = path.extname(name)
  const baseName = stamp && !STAMP_PATTERN.test(name) ? `${stamp}_${path.basename(name, ext)}` : path.basename(name, ext)

  const target = path.join(dir, `${baseName}${ext}`)
  if (target === producedPath) return producedPath

  fs.mkdirSync(dir, { recursive: true })
  const uniqueTarget = uniquePath(dir, baseName, ext)
  moveFile(producedPath, uniqueTarget)
  return uniqueTarget
}

/**
 * Runs that generate a whole set of files (highlight clips, thumbnails, the
 * .srt and the extracted audio) get one stamped folder instead of stamping
 * each file, so everything a run produced stays grouped:
 * `<root>/Highlights/2026-09-09_14-32-05_video/`.
 */
export function createRunOutputDir(feature: OutputFeature, sourcePath: string, stamp: string): string {
  const sourceName = path.basename(sourcePath, path.extname(sourcePath))
  const dir = path.join(getFeatureOutputDir(feature), `${stamp}_${sourceName}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function listEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * Finds the newest output previously generated for `sourcePath` in any of
 * `dirs` — a file named `<nome><suffix>` or `<datetime>_<nome><suffix>`.
 *
 * Transcription is the expensive step of most operations, so a run reuses the
 * `.srt`/extracted audio a previous run already produced for the same source
 * file. The datetime naming means those can't be found by an exact path the
 * way they were when outputs lived next to the source, hence this lookup.
 */
export function findPreviousOutput(dirs: string[], sourcePath: string, suffix: string): string | undefined {
  const sourceName = path.basename(sourcePath, path.extname(sourcePath))
  const exactName = `${sourceName}${suffix}`
  const stampedSuffix = `_${exactName}`

  for (const dir of dirs) {
    const matches = listEntries(dir)
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name === exactName || (name.endsWith(stampedSuffix) && STAMP_PATTERN.test(name)))
      // Names carry the run stamp, so the highest name is the most recent run.
      .sort((a, b) => b.localeCompare(a))

    if (matches.length) return path.join(dir, matches[0])
  }

  return undefined
}

/** Newest previous run folder for `sourcePath` under `feature`, ignoring `exclude` (the current run's own folder). */
export function findPreviousRunDir(
  feature: OutputFeature,
  sourcePath: string,
  exclude?: string
): string | undefined {
  const featureDir = getFeatureOutputDir(feature)
  const sourceName = path.basename(sourcePath, path.extname(sourcePath))
  const stampedSuffix = `_${sourceName}`

  const matches = listEntries(featureDir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(stampedSuffix) && STAMP_PATTERN.test(name))
    .sort((a, b) => b.localeCompare(a))
    .map((name) => path.join(featureDir, name))
    .filter((dir) => dir !== exclude)

  return matches[0]
}
