import fs from 'fs'
import path from 'path'
import { getSafeBaseName, type TranscriptSegment } from 'mediacript'

/**
 * Where `saveSubtitleTextFile` writes the plain-text version of a media file's
 * subtitle. Deliberately not `<base>.txt` — that's the raw transcription file
 * `saveTranscriptionToFile` produces, and both can exist for the same input.
 */
export function getSubtitleTextOutputPath(mediaFilePath: string, outputDir?: string): string {
  const dir = outputDir || path.dirname(mediaFilePath)
  return path.join(dir, `${getSafeBaseName(mediaFilePath)}.legenda.txt`)
}

/**
 * The subtitle's text without the timeline — one cue per line, blank cues
 * dropped. Keeps the subtitle's own line breaks (unlike the transcription
 * file, which is a single blob), so it reads the way the legenda does.
 */
export function segmentsToPlainText(segments: TranscriptSegment[]): string {
  const lines = segments.map((segment) => segment.text.trim()).filter((text) => text.length > 0)
  return lines.join('\n') + '\n'
}

/**
 * Writes the subtitle's plain text next to the media file (or into `outputDir`).
 * @returns Path to the generated .legenda.txt file
 */
export function saveSubtitleTextFile(
  segments: TranscriptSegment[],
  mediaFilePath: string,
  outputDir?: string
): string {
  const outputPath = getSubtitleTextOutputPath(mediaFilePath, outputDir)
  fs.writeFileSync(outputPath, segmentsToPlainText(segments), 'utf-8')
  return outputPath
}
