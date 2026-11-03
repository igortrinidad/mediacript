import path from 'path'
import fs from 'fs'
import os from 'os'
import type { Config, TranscriptSegment, TranscriptWord } from '../types/index.js'
import { getAvailableProviders, transcribeSingleAudio, MAX_FILE_SIZE_MB, type TranscriptionWithSegments } from './index.js'
import { getFileSize, bytesToMB } from '../utils/fileHelpers.js'
import {
  extractTranscriptionAudio,
  measureAudioLevels,
  getAudioDuration,
  deleteDirectory
} from '../utils/ffmpegOperations.js'

/** Resolution of the loudness scan used to pick chunk boundaries */
const LEVEL_WINDOW_SEC = 0.1

/**
 * Whisper's own "this was silence" rule (same thresholds as openai-whisper's
 * `no_speech_threshold` / `logprob_threshold`): segments matching both are
 * almost always hallucinated text over silence or noise.
 */
const NO_SPEECH_PROB_THRESHOLD = 0.6
const NO_SPEECH_LOGPROB_THRESHOLD = -1.0

/**
 * Longest piece re-sent when recovering skipped speech, per round (well under
 * the 10MB request limit). Stretches still empty after the first round are
 * retried once in shorter pieces.
 */
const RECOVERY_PIECE_SEC = [45, 15]

export interface WordTranscriptionOptions {
  /** ISO-639-1 language code (e.g. 'pt'). Omit to auto-detect. */
  language?: string
  /** Whisper `prompt`, e.g. a sample of filler words that must be kept verbatim */
  prompt?: string
  /**
   * Largest audio chunk (MB) sent per request. Defaults to the same limit used
   * by `transcribeAudioWithSegments` (10MB, with the same 10% safety margin).
   */
  maxChunkSizeMB?: number
  /** How far back (seconds) from the size limit to look for the quietest split point. Default 30. */
  splitSearchWindowSec?: number
  /** Chunks transcribed at the same time. Default 4. */
  concurrency?: number
  /** Attempts per chunk (each attempt tries every configured provider). Default 2. */
  maxAttempts?: number
  /**
   * Re-transcribe stretches that came back without words although the audio is
   * clearly not silent (Whisper occasionally skips a whole window). Default true.
   */
  recoverSkippedSpeech?: boolean
  /** Where temporary audio is written. Defaults to the OS temp dir; always cleaned up. */
  tempDir?: string
  /** Progress callback, e.g. to print `[2/5] chunk done` */
  onProgress?: (event: WordTranscriptionProgress) => void
}

export type WordTranscriptionProgress =
  | { type: 'extracting' }
  | { type: 'chunked'; chunks: number; duration: number; sizeMB: number }
  | { type: 'chunk-done'; index: number; total: number }
  | { type: 'recovering'; holes: number }

export interface TranscriptChunkRange {
  start: number
  end: number
}

export interface WordTranscriptionResult {
  text: string
  /** Language reported by the provider for the first chunk, or the requested one */
  language?: string
  /** Duration of the media's audio track, in seconds */
  duration: number
  /** Word-level timeline over the whole file, sorted and non-overlapping */
  words: TranscriptWord[]
  /** Segment-level timeline over the whole file */
  segments: TranscriptSegment[]
  /** Where the audio was split before being sent (one entry when it was not split) */
  chunks: TranscriptChunkRange[]
  /** Stretches that came back without words despite audible sound and were transcribed again */
  recoveredGaps: TranscriptChunkRange[]
}

/**
 * Picks where to split a long recording so every chunk stays within
 * `maxChunkSec`, cutting at the quietest point found in the last
 * `searchWindowSec` before each limit (so a split never lands mid-word when
 * there is any pause around). Pure function, exported for tests.
 * @param levels - RMS level (dB) per window of `windowSec`, from `measureAudioLevels`
 * @returns Chunk ranges covering `[0, duration]` without gaps
 */
export function planChunkRanges(
  levels: number[],
  windowSec: number,
  duration: number,
  maxChunkSec: number,
  searchWindowSec: number = 30
): TranscriptChunkRange[] {
  if (duration <= maxChunkSec) return [{ start: 0, end: duration }]

  const searchSec = Math.min(searchWindowSec, maxChunkSec / 2)
  // Light smoothing so a single quiet window inside a word doesn't win over a real pause
  const smoothed = levels.map((_, i) => {
    const neighbors = [levels[i - 1], levels[i], levels[i + 1]].filter((v) => v !== undefined)
    const finite = neighbors.map((v) => (Number.isFinite(v) ? v : -120))
    return finite.reduce((sum, v) => sum + v, 0) / finite.length
  })

  const ranges: TranscriptChunkRange[] = []
  let start = 0
  while (duration - start > maxChunkSec) {
    const limit = start + maxChunkSec
    const fromIdx = Math.max(0, Math.floor((limit - searchSec) / windowSec))
    const toIdx = Math.min(smoothed.length - 1, Math.floor(limit / windowSec) - 1)

    let cut = limit
    if (toIdx >= fromIdx) {
      let best = fromIdx
      for (let i = fromIdx; i <= toIdx; i++) {
        // `<=` prefers the latest quiet point, keeping chunks as large as allowed
        if (smoothed[i] <= smoothed[best]) best = i
      }
      // Cut in the middle of that quiet stretch, not at its edge next to speech
      let runStart = best
      while (runStart > fromIdx && smoothed[runStart - 1] <= smoothed[best] + 1) runStart--
      cut = ((runStart + best) / 2 + 0.5) * windowSec
    }

    ranges.push({ start, end: cut })
    start = cut
  }
  ranges.push({ start, end: duration })
  return ranges
}

function isNoSpeechSegment(segment: TranscriptSegment): boolean {
  return (segment.noSpeechProb ?? 0) > NO_SPEECH_PROB_THRESHOLD &&
    (segment.avgLogprob ?? 0) < NO_SPEECH_LOGPROB_THRESHOLD
}

/**
 * Merges per-chunk results into one timeline: shifts every timestamp by its
 * chunk start, drops punctuation-only "words" and words inside segments Whisper
 * itself flags as silence, and makes word timings monotonic (providers
 * occasionally return a word starting before the previous one ended).
 * Pure function, exported for tests.
 */
export function mergeChunkTranscripts(
  chunks: Array<{ range: TranscriptChunkRange; result: TranscriptionWithSegments }>
): { text: string; words: TranscriptWord[]; segments: TranscriptSegment[] } {
  const words: TranscriptWord[] = []
  const segments: TranscriptSegment[] = []

  for (const { range, result } of chunks) {
    const offset = range.start
    const silentSegments = result.segments.filter(isNoSpeechSegment)

    for (const segment of result.segments) {
      if (isNoSpeechSegment(segment) || !/[\p{L}\p{N}]/u.test(segment.text)) continue
      segments.push({ ...segment, start: segment.start + offset, end: segment.end + offset })
    }

    for (const w of result.words || []) {
      const word = w.word.trim()
      if (!/[\p{L}\p{N}]/u.test(word)) continue
      const mid = (w.start + w.end) / 2
      if (silentSegments.some((s) => mid >= s.start && mid <= s.end)) continue

      let start = w.start + offset
      let end = Math.min(w.end + offset, range.end)
      const prev = words[words.length - 1]
      if (prev && start < prev.end) start = prev.end
      if (end < start) end = start
      words.push({ word, start: round3(start), end: round3(end) })
    }
  }

  return { text: words.map((w) => w.word).join(' '), words, segments }
}

export interface SpeechHoleOptions {
  /** Shortest uncovered stretch worth re-checking, in seconds. Default 4. */
  minHoleSec?: number
  /** A word "covers" at most this long from its start (Whisper sometimes stretches one word over a skipped window). Default 1.5. */
  maxWordSec?: number
  /**
   * Fixed dB above the recording's noise floor (10th percentile) the hole's
   * 75th-percentile level must reach to count as missed speech. By default the
   * threshold adapts to the file: halfway between the floor and the median
   * level of the speech that *was* recognized, capped at floor + 6dB and never
   * below floor + 2dB. On event/vlog audio the floor is already crowd noise and
   * speech sits only 2–4dB above it, so a fixed margin misses real speech.
   */
  speechAboveFloorDb?: number
}

/**
 * Finds stretches with no recognized words where the audio is clearly not
 * silent. Whisper occasionally "skips" a whole 30s window of real speech
 * (returning one long segment with a few words); sending just that stretch
 * again recovers it. Pure function, exported for tests.
 * @param words - Merged, sorted words over the whole file
 * @param levels - RMS level (dB) per window of `windowSec`, from `measureAudioLevels`
 */
export function findSpeechHoles(
  words: TranscriptWord[],
  levels: number[],
  windowSec: number,
  duration: number,
  options: SpeechHoleOptions = {}
): TranscriptChunkRange[] {
  const minHoleSec = options.minHoleSec ?? 4
  const maxWordSec = options.maxWordSec ?? 1.5
  const finite = levels.filter(Number.isFinite).sort((a, b) => a - b)
  if (finite.length === 0) return []
  const floorDb = finite[Math.floor(finite.length * 0.1)]
  let loudDb = floorDb + 6
  if (options.speechAboveFloorDb !== undefined) {
    loudDb = floorDb + options.speechAboveFloorDb
  } else {
    const speech: number[] = []
    for (const w of words) {
      const to = Math.min(levels.length, Math.ceil(Math.min(w.end, w.start + maxWordSec) / windowSec))
      for (let i = Math.floor(w.start / windowSec); i < to; i++) if (Number.isFinite(levels[i])) speech.push(levels[i])
    }
    if (speech.length > 0) {
      speech.sort((a, b) => a - b)
      const speechDb = speech[Math.floor(speech.length / 2)]
      loudDb = Math.min(floorDb + 6, Math.max(floorDb + 2, (floorDb + speechDb) / 2))
    }
  }

  const holes: TranscriptChunkRange[] = []
  const check = (start: number, end: number) => {
    if (end - start < minHoleSec) return
    const from = Math.floor(start / windowSec)
    const to = Math.min(levels.length, Math.ceil(end / windowSec))
    if (to <= from) return
    const window = levels.slice(from, to).map((v) => (Number.isFinite(v) ? v : -120)).sort((a, b) => a - b)
    // 75th percentile, not the median: speech has pauses between words, and
    // distant/quiet speakers only stand out from crowd noise at their peaks.
    if (window[Math.floor(window.length * 0.75)] >= loudDb) holes.push({ start: round3(start), end: round3(end) })
  }

  let covered = 0
  for (const w of words) {
    check(covered, w.start)
    covered = Math.max(covered, Math.min(w.end, w.start + maxWordSec))
  }
  check(covered, duration)
  return holes
}

/**
 * Splices words recovered from re-transcribed holes into the main timeline:
 * keeps only new words inside their hole, re-sorts, and trims any word that
 * was stretched over the hole so it ends where the next word starts.
 */
function spliceHoleWords(words: TranscriptWord[], recovered: TranscriptWord[]): TranscriptWord[] {
  const all = [...words, ...recovered].sort((a, b) => a.start - b.start)
  for (let i = 0; i < all.length - 1; i++) {
    if (all[i].end > all[i + 1].start) all[i] = { ...all[i], end: Math.max(all[i].start, all[i + 1].start) }
  }
  return all
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

/**
 * Transcribes any audio/video file with **word-level timestamps**, built for
 * editing pipelines that need to cut on word boundaries.
 *
 * Differences from `transcribeAudioWithSegments`:
 * - extracts a 16kHz mono 32kbps track first (≈14MB/hour), so most recordings
 *   fit in a single request;
 * - when they don't, keeps the same per-request size limit (10MB by default)
 *   but splits at the quietest point near each limit instead of at a fixed time;
 * - chunks are transcribed in parallel and retried, still falling back across
 *   the configured providers (Groq, then OpenAI);
 * - timestamps are rebased to the exact chunk start used for extraction.
 *
 * Throws on failure (unlike the null-returning helpers), so callers can fall
 * back to another engine.
 */
export async function transcribeMediaWithWords(
  mediaPath: string,
  config: Config,
  options: WordTranscriptionOptions = {}
): Promise<WordTranscriptionResult> {
  const providers = getAvailableProviders(config, {
    language: options.language,
    prompt: options.prompt,
    wordTimestamps: true
  })
  if (providers.length === 0) {
    throw new Error('No transcription provider configured (Groq/OpenAI)')
  }

  const maxChunkSizeMB = options.maxChunkSizeMB ?? MAX_FILE_SIZE_MB
  const concurrency = options.concurrency ?? 4
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2)
  const baseName = path.basename(mediaPath, path.extname(mediaPath)).replace(/[^\w.-]+/g, '_')
  const workDir = fs.mkdtempSync(path.join(options.tempDir || os.tmpdir(), `mediacript-words-${baseName}-`))

  try {
    options.onProgress?.({ type: 'extracting' })
    const fullAudio = await extractTranscriptionAudio(mediaPath, path.join(workDir, 'full.mp3'))
    const duration = await getAudioDuration(fullAudio)
    const sizeMB = bytesToMB(getFileSize(fullAudio))

    const levels = await measureAudioLevels(fullAudio, LEVEL_WINDOW_SEC)
    let ranges: TranscriptChunkRange[] = [{ start: 0, end: duration }]
    let chunkFiles: string[] = [fullAudio]

    if (sizeMB > maxChunkSizeMB) {
      // Same sizing rule as `splitAudioIntoChunks`: 90% of the limit, proportional to duration
      const maxChunkSec = Math.floor((duration * maxChunkSizeMB * 0.9) / sizeMB)
      ranges = planChunkRanges(levels, LEVEL_WINDOW_SEC, duration, maxChunkSec, options.splitSearchWindowSec)
      chunkFiles = []
      for (let i = 0; i < ranges.length; i++) {
        const file = path.join(workDir, `chunk_${String(i).padStart(3, '0')}.mp3`)
        chunkFiles.push(await extractTranscriptionAudio(fullAudio, file, ranges[i]))
      }
    }
    options.onProgress?.({ type: 'chunked', chunks: ranges.length, duration, sizeMB })

    // The prompt is what makes Whisper skip whole windows on noisy audio, so
    // stretches being recovered are sent again without it.
    const recoveryProviders = options.prompt
      ? getAvailableProviders(config, { language: options.language, wordTimestamps: true })
      : providers

    const transcribeWithRetry = async (file: string, label: string, using = providers): Promise<TranscriptionWithSegments> => {
      let result: TranscriptionWithSegments | null = null
      for (let attempt = 1; attempt <= maxAttempts && !result; attempt++) {
        if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
        result = await transcribeSingleAudio(file, using)
      }
      if (!result) throw new Error(`Failed to transcribe ${label} with all available services`)
      return result
    }

    const results: TranscriptionWithSegments[] = new Array(ranges.length)
    await runWithConcurrency(chunkFiles, concurrency, async (file, index) => {
      results[index] = await transcribeWithRetry(file, `chunk ${index + 1}/${ranges.length}`)
      options.onProgress?.({ type: 'chunk-done', index, total: ranges.length })
    })

    const merged = mergeChunkTranscripts(ranges.map((range, i) => ({ range, result: results[i] })))

    const holes: TranscriptChunkRange[] = []
    if (options.recoverSkippedSpeech !== false) {
      // Holes are re-sent in short pieces (split at quiet points): long
      // stretches are exactly where Whisper tends to skip again. A hole that
      // is still empty after a round is tried once more in even smaller pieces.
      let tried: TranscriptChunkRange[] | null = null
      for (const [round, pieceSec] of RECOVERY_PIECE_SEC.entries()) {
        const found = findSpeechHoles(merged.words, levels, LEVEL_WINDOW_SEC, duration)
          .filter((h) => !tried || tried.some((t) => h.start < t.end && h.end > t.start))
        const pieces = found.flatMap((hole) => {
          if (hole.end - hole.start <= pieceSec) return [hole]
          const from = Math.floor(hole.start / LEVEL_WINDOW_SEC)
          const slice = levels.slice(from, Math.ceil(hole.end / LEVEL_WINDOW_SEC))
          return planChunkRanges(slice, LEVEL_WINDOW_SEC, hole.end - hole.start, pieceSec, Math.min(10, pieceSec / 3))
            .map((r) => ({ start: round3(hole.start + r.start), end: round3(hole.start + r.end) }))
        })
        if (pieces.length === 0) break
        options.onProgress?.({ type: 'recovering', holes: pieces.length })
        const recovered: Array<{ range: TranscriptChunkRange; result: TranscriptionWithSegments }> = new Array(pieces.length)
        await runWithConcurrency(pieces, concurrency, async (hole, index) => {
          const file = await extractTranscriptionAudio(fullAudio, path.join(workDir, `hole_${round}_${String(index).padStart(3, '0')}.mp3`), hole)
          recovered[index] = { range: hole, result: await transcribeWithRetry(file, `gap ${index + 1}/${pieces.length}`, recoveryProviders) }
        })
        const recoveredMerge = mergeChunkTranscripts(recovered)
        const recoveredWords = recoveredMerge.words
          .filter((w) => pieces.some((h) => w.start >= h.start && w.start < h.end))
        merged.words = spliceHoleWords(merged.words, recoveredWords)
        merged.text = merged.words.map((w) => w.word).join(' ')
        merged.segments = [...merged.segments, ...recoveredMerge.segments].sort((a, b) => a.start - b.start)
        holes.push(...pieces)
        tried = pieces
      }
      holes.sort((a, b) => a.start - b.start)
    }

    return {
      ...merged,
      language: results.find((r) => r.language)?.language || options.language,
      duration,
      chunks: ranges,
      recoveredGaps: holes
    }
  } finally {
    deleteDirectory(workDir)
  }
}
