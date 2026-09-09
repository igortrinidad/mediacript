import fs from 'fs'
import { compressVideoFile } from 'mediacript'
import { captureConsole } from './consoleCapture'
import { createRunStamp, getFeatureOutputDir, moveOutputInto } from './outputPaths'
import { recordActivity } from './historyStore'
import type {
  ScreencastLogLine,
  ScreencastProcessRequest,
  ScreencastProcessResult,
  ScreencastQualityPreset
} from '../../shared/types'

type ProgressFn = (step: string, status: 'running' | 'completed' | 'failed', detail?: string) => void
type LogFn = (line: ScreencastLogLine) => void

const ANALYZE_STEP = 'Analisar gravação'
const FINISH_STEP = 'Finalizar arquivo'

interface QualityProfile {
  label: string
  /** Video bitrate the preset would like to spend, before the size ceiling applies. */
  videoKbps: number
  /** Hard ceiling on the output file, in MB. `null` means "spend whatever quality needs". */
  maxSizeMB: number | null
  /** x264 CRF — the real quality driver; -maxrate only caps the peaks. */
  crf: number
  /** Ceiling on output height. The real height can still step down (see `resolveHeight`). */
  maxHeight: number
}

/**
 * WhatsApp re-encodes anything it accepts as media and rejects large files
 * outright, so its ceiling sits well under the 64MB limit to leave room for
 * that second pass. The other two presets exist for when the recording is
 * going to Drive/e-mail instead.
 */
const QUALITY_PROFILES: Record<ScreencastQualityPreset, QualityProfile> = {
  whatsapp: { label: 'WhatsApp', videoKbps: 3500, maxSizeMB: 45, crf: 22, maxHeight: 1080 },
  balanced: { label: 'Equilibrado', videoKbps: 6000, maxSizeMB: 150, crf: 21, maxHeight: 1080 },
  high: { label: 'Alta qualidade', videoKbps: 12000, maxSizeMB: null, crf: 19, maxHeight: 1440 }
}

const DEFAULT_PRESET: ScreencastQualityPreset = 'whatsapp'
const AUDIO_KBPS = 96
const NO_AUDIO_KBPS = 0

/**
 * Minimum video bitrate each height needs before screen text starts smearing.
 * A long recording squeezed under a size ceiling runs out of bitrate for 1080p
 * — downscaling then buys back far more legibility than it costs, since fewer
 * pixels each get more bits.
 */
const HEIGHT_FLOORS: { height: number; minKbps: number }[] = [
  { height: 1440, minKbps: 5000 },
  { height: 1080, minKbps: 2500 },
  { height: 720, minKbps: 1200 },
  { height: 540, minKbps: 0 }
]

/** Highest height whose bitrate floor the budget can actually sustain. */
function resolveHeight(videoKbps: number, maxHeight: number): number {
  const candidate = HEIGHT_FLOORS.find((step) => step.height <= maxHeight && videoKbps >= step.minKbps)
  return candidate?.height ?? 540
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** `12:04` / `1:02:33` — how long the recording ran, for its History label. */
function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const pad = (value: number): string => String(value).padStart(2, '0')
  const hours = Math.floor(seconds / 3600)
  const rest = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
  return hours ? `${hours}:${rest}` : rest
}

/**
 * Turns the raw screen recording into the final optimized mp4, reporting one
 * progress event per step and mirroring mediacript's console/ffmpeg output so
 * the renderer can show the same checklist + live log the conversion jobs do.
 */
export async function processRecording(
  request: ScreencastProcessRequest,
  emitProgress: ProgressFn,
  onLog: LogFn
): Promise<ScreencastProcessResult> {
  const stopCapture = captureConsole((line) => onLog({ ...line, timestamp: new Date().toISOString() }))
  const startedAt = new Date().toISOString()
  const label = `Gravação de tela (${formatDuration(request.durationSeconds)})`
  const profile = QUALITY_PROFILES[request.qualityPreset ?? DEFAULT_PRESET] ?? QUALITY_PROFILES[DEFAULT_PRESET]
  const hasAudio = request.hasAudio !== false
  const audioKbps = hasAudio ? AUDIO_KBPS : NO_AUDIO_KBPS

  try {
    emitProgress(ANALYZE_STEP, 'running')
    let rawSizeBytes: number
    let targetSizeMB: number
    let outputHeight: number
    let optimizeStep: string
    try {
      if (!fs.existsSync(request.rawFilePath)) {
        throw new Error(`A gravação bruta não foi encontrada: ${request.rawFilePath}`)
      }
      rawSizeBytes = fs.statSync(request.rawFilePath).size
      const durationSeconds = Math.max(request.durationSeconds, 1)

      // What the preset would like to spend, then clamped to its ceiling — the
      // ceiling is what actually keeps a long recording sendable.
      const preferredMB = ((profile.videoKbps + audioKbps) * durationSeconds) / 8192
      const cappedMB = profile.maxSizeMB === null ? preferredMB : Math.min(preferredMB, profile.maxSizeMB)
      targetSizeMB = Math.max(2, Math.ceil(cappedMB))

      // Re-derive the bitrate the (possibly clamped) budget really affords, so
      // the height decision reflects the ceiling rather than the wish.
      const effectiveVideoKbps = Math.floor((targetSizeMB * 8192) / durationSeconds) - audioKbps
      outputHeight = resolveHeight(effectiveVideoKbps, profile.maxHeight)
      optimizeStep = `Otimizar vídeo (H.264 ${outputHeight}p)`

      console.log(
        `\n🎥 Gravação bruta: ${formatMB(rawSizeBytes)} (${Math.round(durationSeconds)}s) → ${profile.label}: até ${targetSizeMB}MB, ${outputHeight}p @ ~${Math.max(effectiveVideoKbps, 0)}kbps`
      )
      if (profile.maxSizeMB !== null && preferredMB > profile.maxSizeMB) {
        console.log(
          `   ⚠️  Gravação longa para o preset ${profile.label} — bitrate reduzido para caber em ${profile.maxSizeMB}MB.`
        )
      }
    } catch (error: any) {
      emitProgress(ANALYZE_STEP, 'failed', error?.message || String(error))
      throw error
    }
    emitProgress(
      ANALYZE_STEP,
      'completed',
      `${formatMB(rawSizeBytes)} · ${profile.label} · alvo ${targetSizeMB}MB · ${outputHeight}p`
    )

    emitProgress(optimizeStep, 'running')
    let outputPath: string
    try {
      const screencastDir = getFeatureOutputDir('screencast')
      const result = await compressVideoFile(request.rawFilePath, targetSizeMB, {
        preset: 'slow',
        crf: profile.crf,
        maxHeight: outputHeight,
        audioBitrateKbps: audioKbps,
        monoAudio: hasAudio,
        dropAudio: !hasAudio,
        outputDir: screencastDir
      })
      // The raw file is already datetime-named, so the optimized mp4 derived
      // from it keeps that same stamp instead of getting a second one.
      outputPath = moveOutputInto(result.outputPath, screencastDir, createRunStamp())
    } catch (error: any) {
      emitProgress(optimizeStep, 'failed', error?.message || String(error))
      throw error
    }
    emitProgress(optimizeStep, 'completed')

    emitProgress(FINISH_STEP, 'running')
    let sizeBytes: number
    try {
      sizeBytes = fs.statSync(outputPath).size
      console.log(`✓ Gravação pronta: ${formatMB(sizeBytes)} (era ${formatMB(rawSizeBytes)})`)
    } catch (error: any) {
      emitProgress(FINISH_STEP, 'failed', error?.message || String(error))
      throw error
    }
    emitProgress(FINISH_STEP, 'completed', formatMB(sizeBytes))

    recordActivity({
      operation: 'screencast',
      operationLabel: label,
      inputFile: request.rawFilePath,
      outputFiles: [outputPath],
      startedAt
    })

    return { outputPath, sizeBytes, rawFilePath: request.rawFilePath, rawSizeBytes }
  } catch (error: any) {
    recordActivity({
      operation: 'screencast',
      operationLabel: label,
      inputFile: request.rawFilePath,
      outputFiles: [],
      startedAt,
      error: error?.message || String(error)
    })
    throw error
  } finally {
    stopCapture()
  }
}
