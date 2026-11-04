import fs from 'fs'
import path from 'path'
import type { TranscriptSegment } from '../types/index.js'
import { getSafeBaseName } from '../utils/fileHelpers.js'

/**
 * Formats seconds as an SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = Math.floor(clamped % 60)
  const milliseconds = Math.round((clamped - Math.floor(clamped)) * 1000)

  const pad2 = (n: number) => String(n).padStart(2, '0')
  const pad3 = (n: number) => String(n).padStart(3, '0')

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(milliseconds)}`
}

/**
 * Converts transcript segments (with start/end in seconds) into SRT subtitle content.
 */
export function segmentsToSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((segment, index) => {
      const text = segment.text.trim()
      return `${index + 1}\n${formatSrtTimestamp(segment.start)} --> ${formatSrtTimestamp(segment.end)}\n${text}\n`
    })
    .join('\n')
    .trim() + '\n'
}

/**
 * Where `saveSrtFile` would write (or has already written) the .srt for a
 * media file — shared so callers can check for an existing file without
 * duplicating the naming convention.
 */
export function getSrtOutputPath(mediaFilePath: string, outputDir?: string): string {
  const dir = outputDir || path.dirname(mediaFilePath)
  return path.join(dir, `${getSafeBaseName(mediaFilePath)}.srt`)
}

/**
 * Writes an SRT file with the full timeline for a media file, next to it.
 * @param segments - Transcript segments with timestamps
 * @param mediaFilePath - Original media file path (used to derive the output filename)
 * @param outputDir - Optional output directory (defaults to media file directory)
 * @returns Path to the generated .srt file
 */
export function saveSrtFile(
  segments: TranscriptSegment[],
  mediaFilePath: string,
  outputDir?: string
): string {
  const outputPath = getSrtOutputPath(mediaFilePath, outputDir)
  fs.writeFileSync(outputPath, segmentsToSrt(segments), 'utf-8')
  return outputPath
}

/**
 * Parses an SRT timestamp ("HH:MM:SS,mmm") into seconds — the inverse of `formatSrtTimestamp`.
 */
export function parseSrtTimestamp(timestamp: string): number {
  const match = timestamp.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/)
  if (!match) {
    throw new Error(`Timestamp SRT inválido: "${timestamp}"`)
  }

  const [, hours, minutes, seconds, milliseconds] = match
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000
}

/**
 * Parses SRT file content back into transcript segments — the inverse of `segmentsToSrt`.
 * Tolerant of missing/blank cue-number lines and multi-line cue text.
 */
export function srtToSegments(content: string): TranscriptSegment[] {
  const blocks = content.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/)
  const segments: TranscriptSegment[] = []

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0)
    const timingLineIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingLineIndex === -1) continue

    const timingMatch = lines[timingLineIndex].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/)
    if (!timingMatch) continue

    const text = lines.slice(timingLineIndex + 1).join(' ').trim()
    if (!text) continue

    segments.push({
      start: parseSrtTimestamp(timingMatch[1]),
      end: parseSrtTimestamp(timingMatch[2]),
      text
    })
  }

  return segments
}

/**
 * Reads and parses an existing .srt file (e.g. one from a previous run), so
 * callers can reuse it instead of re-transcribing the same media file.
 */
export function loadSrtFile(srtPath: string): TranscriptSegment[] {
  return srtToSegments(fs.readFileSync(srtPath, 'utf-8'))
}
