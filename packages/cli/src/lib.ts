/**
 * MediaScript - Programmatic API
 * 
 * Use this module to integrate MediaScript functionality into your Node.js applications.
 */

import fs from 'fs'
import path from 'path'
import { verifyFfmpeg, checkFfmpegInstalled } from './utils/ffmpegCheck.js'
import { ensureConfig, loadConfig, saveConfig, hasApiKey, getConfigDir } from './config/index.js'
import { listMediaFiles, detectFileType, createOutputFolderForFile, slugify, type FileType } from './utils/fileHelpers.js'
import {
  convertVideo,
  extractAudio,
  getExtractedAudioPath,
  convertAudio,
  getAudioDuration,
  splitAudioIntoChunks,
  cutVideoSegments,
  cutVideoSegment,
  exportClipToFormat as exportClipToFormatInternal,
  compressVideoToTargetSize,
  applyHardSubtitles,
  applySoftSubtitles,
  type ConversionOptions,
  type ConversionPreset,
  type HardwareAcceleration,
  type CompressToTargetSizeOptions,
  type SubtitleMode
} from './utils/ffmpegOperations.js'
import {
  EXPORT_FORMATS,
  QUALITY_PRESETS,
  getExportFormat,
  getQualityPreset,
  type ExportFormatId,
  type ExportFormatDefinition,
  type QualityPresetId,
  type QualityPresetDefinition,
  type FramingMode
} from './utils/exportFormats.js'
import { transcribeAudio, transcribeAudioWithSegments, saveTranscription } from './transcript/index.js'
import { saveSrtFile, getSrtOutputPath, loadSrtFile } from './subtitles/srt.js'
import { extractHighlightsFromTranscript, applyHighlightMargin } from './highlights/index.js'
import { continueHighlightChat, type HighlightChatMessage, type HighlightChatTurnResult } from './highlights/chat.js'
import { generateThumbnailFrames, saveThumbnailPrompts, DEFAULT_THUMBNAIL_FRAME_COUNT } from './thumbnails/index.js'
import {
  createAIProvider,
  AI_MODELS_BY_PROVIDER,
  AI_PROVIDER_LABELS,
  MODEL_PRICING,
  MODEL_PRICING_AS_OF,
  getModelPrice,
  type AIProviderName,
  type ModelPrice
} from './ai/index.js'
import type { Config, TranscriptSegment, HighlightSegment, HighlightFallbackModel } from './types/index.js'

export interface MediaScriptOptions {

  /**
   * Output directory for converted files and transcriptions. 
   * Defaults to the same directory as the input file if not provided.
   */
  outputDir?: string | undefined
  
  groqApiKey?: string
  
  openaiApiKey?: string
  /** Video conversion options for speed/quality control */
  
  conversionOptions?: ConversionOptions
  /**
   * Skip video conversion and extract audio directly from the original file.
   * Useful for formats like .webm, .mkv, .mov where you only need the transcript.
   */
  skipVideoConversion?: boolean
}

export interface TranscriptionResult {
  text: string
  duration?: number
  filePath: string
  /** Segment-level timeline (start/end in seconds), used to generate SRT subtitles and highlights */
  segments?: TranscriptSegment[]
}

export interface ConversionResult {
  outputPath: string
  originalPath: string
}

export interface HighlightClipResult {
  /** Folder holding this clip's video, thumbnail frames and prompt ideas */
  clipDir: string
  clip: ConversionResult
  highlight: HighlightSegment
  /** Preview frame image paths, spaced evenly across the clip */
  thumbnailFrames: string[]
  /** Path to the text file with AI-suggested thumbnail prompt ideas, or null if none were provided */
  thumbnailPromptsFile: string | null
}

export interface SubtitlesResult {
  srtPath: string
  segments: TranscriptSegment[]
  text: string
}

export interface SubtitleApplyResult extends ConversionResult {
  mode: SubtitleMode
}

export interface HighlightAIOptions {
  /** Which LLM provider to use to pick the best moments */
  provider: AIProviderName
  /** Model id from AI_MODELS_BY_PROVIDER[provider] (custom ids are also accepted) */
  model: string
  apiKey: string
  temperature?: number
  maxTokens?: number
  /** Extra attempts after a retryable failure (network error, timeout, 429, 5xx). Defaults to 2. */
  maxRetries?: number
}

// Re-export conversion types for convenience
export type { ConversionOptions, ConversionPreset, HardwareAcceleration, CompressToTargetSizeOptions }
export { getExtractedAudioPath }

// Re-export for consumers (e.g. the desktop app's Subtitle module) that let
// the user choose how a generated .srt gets applied to the video
export type { SubtitleMode }

// Re-export the export-format/quality catalog and types for consumers (e.g. the
// desktop app's Agents/Convert flows) that let the user pick a target platform
// aspect ratio and quality level
export { EXPORT_FORMATS, QUALITY_PRESETS, getExportFormat, getQualityPreset }
export type { ExportFormatId, ExportFormatDefinition, QualityPresetId, QualityPresetDefinition, FramingMode }

// Re-export AI provider types/constants for convenience
export { AI_MODELS_BY_PROVIDER, AI_PROVIDER_LABELS, createAIProvider, MODEL_PRICING, MODEL_PRICING_AS_OF, getModelPrice }
export type { AIProviderName, ModelPrice, TranscriptSegment, HighlightSegment }

// Re-export the SRT writer for consumers that orchestrate their own transcribe+save
// steps (e.g. a GUI wanting fine-grained per-step progress instead of generateSubtitles)
export { saveSrtFile, getSrtOutputPath, loadSrtFile }

// Re-export for consumers (CLI, desktop app) that orchestrate their own steps
// and need to resolve/create the same per-file output folder used internally
export { createOutputFolderForFile }
export { DEFAULT_THUMBNAIL_FRAME_COUNT }

/**
 * Initialize MediaScript and verify dependencies
 * @throws Error if ffmpeg is not installed
 */
export async function initialize(): Promise<void> {
  await verifyFfmpeg()
}

/**
 * Non-interactive ffmpeg check — returns installation status/version instead
 * of printing to the console and throwing. Intended for GUI consumers.
 */
export function getFfmpegStatus(): { installed: boolean; version?: string; error?: string } {
  return checkFfmpegInstalled()
}

/**
 * Load configuration from .env or create if doesn't exist
 * @returns Configuration object with API keys
 */
export async function getConfig(): Promise<Config> {
  await ensureConfig()
  return loadConfig()
}

/**
 * Check if at least one API key is configured
 * @returns true if either Groq or OpenAI key is configured
 */
export function isConfigured(): boolean {
  const config = loadConfig()
  return hasApiKey(config)
}

/**
 * Reads the stored configuration without any interactive prompting — unlike
 * `getConfig()`, which may prompt the user via inquirer if no key is set yet.
 * Intended for non-interactive consumers such as GUI applications.
 */
export function getStoredConfig(): Config {
  return loadConfig()
}

/**
 * Persists configuration values (e.g. API keys), merging with whatever is
 * already stored. Intended for non-interactive consumers such as GUI
 * applications that manage their own settings screen.
 */
export function saveStoredConfig(config: Partial<Config>): Config {
  const merged = { ...loadConfig(), ...config }
  saveConfig(merged)
  return merged
}

/**
 * Directory where mediacript's config (and anything sharing storage with it,
 * like a GUI app's run history) is kept:
 * Linux/Mac: ~/.config/ffmpeg-simple-converter
 * Windows: %APPDATA%/ffmpeg-simple-converter
 */
export function getConfigDirectory(): string {
  return getConfigDir()
}

/**
 * Convert a video file to a more performant format (H.264/AAC)
 * @param inputPath - Path to the input video file
 * @param outputDir - Optional output directory (defaults to input file directory)
 * @param options - Optional conversion options for speed/quality control
 * @returns Promise with the output file path
 * 
 * @example
 * // Fast conversion (lower quality but much faster)
 * await convertVideoFile('video.webm', './output', { 
 *   preset: 'veryfast', 
 *   crf: 28 
 * })
 * 
 * @example
 * // Use hardware acceleration (NVIDIA GPU)
 * await convertVideoFile('video.webm', './output', { 
 *   hwaccel: 'auto',
 *   preset: 'fast'
 * })
 */
export async function convertVideoFile(
  inputPath: string,
  options?: ConversionOptions
): Promise<ConversionResult> {
  const outputPath = await convertVideo(inputPath, options)
  return {
    outputPath,
    originalPath: inputPath
  }
}

/**
 * Extract audio from a video file
 * @param inputPath - Path to the input video file
 * @param outputDir - Optional output directory (defaults to input file directory)
 * @returns Promise with the output audio file path
 */
export async function extractAudioFromVideo(
  inputPath: string,
  outputDir?: string
): Promise<ConversionResult> {
  const outputPath = await extractAudio(inputPath, outputDir)
  return {
    outputPath,
    originalPath: inputPath
  }
}

/**
 * Convert an audio file to MP3 format
 * @param inputPath - Path to the input audio file
 * @param outputDir - Optional output directory (defaults to input file directory)
 * @returns Promise with the output file path
 */
export async function convertAudioFile(
  inputPath: string,
  outputDir?: string
): Promise<ConversionResult> {
  const outputPath = await convertAudio(inputPath, outputDir)
  return {
    outputPath,
    originalPath: inputPath
  }
}

/**
 * Transcribe an audio file using Groq or OpenAI Whisper
 * Automatically handles files larger than 10MB by splitting into chunks
 * @param audioPath - Path to the audio file
 * @param options - Optional API keys (if not provided, will use config from .env)
 * @returns Promise with transcription result
 */
export async function transcribeAudioFile(
  audioPath: string,
  options?: MediaScriptOptions
): Promise<TranscriptionResult | null> {
  let config: Config
  
  if (options?.groqApiKey || options?.openaiApiKey) {
    // Use provided API keys
    config = {
      groqApiKey: options.groqApiKey || '',
      openaiApiKey: options.openaiApiKey || ''
    }
  } else {
    // Load from config
    config = loadConfig()
  }
  
  const result = await transcribeAudioWithSegments(audioPath, config)

  if (!result) {
    return null
  }

  // Try to get duration
  let duration: number | undefined
  try {
    duration = await getAudioDuration(audioPath)
  } catch (err) {
    // Duration is optional
  }

  return {
    text: result.text,
    duration,
    filePath: audioPath,
    segments: result.segments
  }
}

/**
 * Save transcription text to a file
 * @param transcriptionText - The transcribed text
 * @param audioFilePath - Original audio file path (used to generate output filename)
 * @returns Promise with the saved file path
 */
export async function saveTranscriptionToFile(
  transcriptionText: string,
  audioFilePath: string
): Promise<string> {
  return saveTranscription(audioFilePath, transcriptionText)
}

/**
 * Transcribe an audio file and generate an SRT subtitle file with the full timeline.
 * @param audioPath - Path to the audio file
 * @param options - Optional API keys and output directory (if not provided, will use config from .env)
 * @returns Promise with the SRT file path, segments and plain text, or null if transcription failed
 */
export async function generateSubtitles(
  audioPath: string,
  options?: MediaScriptOptions
): Promise<SubtitlesResult | null> {
  let config: Config

  if (options?.groqApiKey || options?.openaiApiKey) {
    config = {
      groqApiKey: options.groqApiKey || '',
      openaiApiKey: options.openaiApiKey || ''
    }
  } else {
    config = loadConfig()
  }

  const result = await transcribeAudioWithSegments(audioPath, config)

  if (!result) {
    return null
  }

  const srtPath = saveSrtFile(result.segments, audioPath, options?.outputDir)

  return {
    srtPath,
    segments: result.segments,
    text: result.text
  }
}

/**
 * Applies subtitles to a video file — burned into the frames (hardsub, via
 * ffmpeg's libass `subtitles` filter; always re-encodes) or muxed in as a
 * separate, toggleable stream (softsub, `mov_text`; stream-copy, but
 * requires the source's existing codecs to already be MP4-compatible).
 * @param videoPath - Path to the source video
 * @param srtPath - Path to the .srt file to apply (e.g. from generateSubtitles)
 * @param mode - 'hardsub' (burned in) or 'softsub' (separate track)
 * @param outputDir - Optional output directory (defaults to the video's directory)
 */
export async function applySubtitlesToVideo(
  videoPath: string,
  srtPath: string,
  mode: SubtitleMode,
  outputDir?: string
): Promise<SubtitleApplyResult> {
  const outputPath = mode === 'hardsub'
    ? await applyHardSubtitles(videoPath, srtPath, { outputDir })
    : await applySoftSubtitles(videoPath, srtPath, { outputDir })
  return { outputPath, originalPath: videoPath, mode }
}

/**
 * Uses an LLM (Anthropic, Gemini or OpenRouter) to select the best highlight
 * moments from a transcript timeline, based on a free-text prompt.
 * @param segments - Transcript segments with timestamps (e.g. from generateSubtitles)
 * @param prompt - Free-text instructions describing what to look for (e.g. "os 3 melhores momentos de humor")
 * @param aiOptions - Which provider/model/API key to use
 * @param fallbackOptions - Ordered list of provider/model/API key alternatives to try,
 *   in order, if `aiOptions` fails even after its own retries
 * @returns Promise with the selected highlight segments, ordered chronologically
 */
export async function extractVideoHighlights(
  segments: TranscriptSegment[],
  prompt: string,
  aiOptions: HighlightAIOptions,
  fallbackOptions: HighlightAIOptions[] = []
): Promise<HighlightSegment[]> {
  return extractHighlightsFromTranscript(segments, prompt, aiOptions, fallbackOptions)
}

/**
 * Advances an ongoing highlight-selection conversation by one turn: given the
 * transcript timeline, the conversation so far, the current highlight
 * selection and the user's latest message, asks the AI for both a chat reply
 * and the updated highlight list. Use this instead of `extractVideoHighlights`
 * to let the user and the AI iteratively refine the selection together,
 * rather than picking highlights from a single free-text prompt.
 * @param segments - Transcript segments with timestamps (e.g. from generateSubtitles)
 * @param history - Prior turns of the conversation, NOT including `userMessage`
 * @param userMessage - The user's latest chat message
 * @param currentHighlights - The highlight selection as it stands before this turn
 * @param aiOptions - Which provider/model/API key to use
 * @param fallbackOptions - Ordered list of provider/model/API key alternatives to try,
 *   in order, if `aiOptions` fails even after its own retries
 */
export async function continueVideoHighlightChat(
  segments: TranscriptSegment[],
  history: HighlightChatMessage[],
  userMessage: string,
  currentHighlights: HighlightSegment[],
  aiOptions: HighlightAIOptions,
  fallbackOptions: HighlightAIOptions[] = [],
  objective?: string
): Promise<HighlightChatTurnResult> {
  return continueHighlightChat(segments, history, userMessage, currentHighlights, aiOptions, fallbackOptions, objective)
}

/**
 * Cuts one clip per highlight out of the source video.
 * @param videoPath - Path to the original video file
 * @param highlights - Highlight segments (e.g. from extractVideoHighlights)
 * @param outputDir - Optional output directory (defaults to video file directory)
 * @param marginSeconds - Extra seconds to keep before/after each highlight, so the
 *   cut doesn't land exactly on the AI-picked boundary and clip off important
 *   context. Clamped to the video's actual duration. Defaults to 0 (no margin).
 * @returns Promise with the generated clip file paths
 */
export async function cutHighlightClips(
  videoPath: string,
  highlights: HighlightSegment[],
  outputDir?: string,
  marginSeconds: number = 0
): Promise<ConversionResult[]> {
  let clipsToCut = highlights

  if (marginSeconds > 0) {
    let maxDuration: number | undefined
    try {
      maxDuration = await getAudioDuration(videoPath)
    } catch (err) {
      // Duration probe is best-effort; margin is still applied without an upper clamp
    }
    clipsToCut = applyHighlightMargin(highlights, marginSeconds, maxDuration)
  }

  const outputPaths = await cutVideoSegments(
    videoPath,
    clipsToCut.map((highlight) => ({ start: highlight.start, end: highlight.end })),
    outputDir
  )

  return outputPaths.map((outputPath) => ({
    outputPath,
    originalPath: videoPath
  }))
}

/**
 * Cuts one clip per highlight and, for each clip, also generates a set of
 * preview thumbnail frames and (when the AI provided them) a text file with
 * thumbnail prompt ideas. Every clip gets its own subfolder inside `rootDir`
 * (e.g. `<rootDir>/clip-01-<title-slug>/`) to keep the many generated files organized.
 * @param videoPath - Path to the original video file
 * @param highlights - Highlight segments (e.g. from extractVideoHighlights)
 * @param rootDir - Directory the per-clip subfolders are created in (e.g. from createOutputFolderForFile)
 * @param options - Clip margin and thumbnail frame count
 */
export async function cutHighlightClipsWithAssets(
  videoPath: string,
  highlights: HighlightSegment[],
  rootDir: string,
  options?: { marginSeconds?: number; thumbnailFrameCount?: number }
): Promise<HighlightClipResult[]> {
  let clipsToCut = highlights

  const marginSeconds = options?.marginSeconds ?? 0
  if (marginSeconds > 0) {
    let maxDuration: number | undefined
    try {
      maxDuration = await getAudioDuration(videoPath)
    } catch (err) {
      // Duration probe is best-effort; margin is still applied without an upper clamp
    }
    clipsToCut = applyHighlightMargin(highlights, marginSeconds, maxDuration)
  }

  const results: HighlightClipResult[] = []

  for (let i = 0; i < clipsToCut.length; i++) {
    const highlight = clipsToCut[i]
    const clipName = `clip-${String(i + 1).padStart(2, '0')}-${slugify(highlight.title)}`
    const clipDir = path.join(rootDir, clipName)
    fs.mkdirSync(clipDir, { recursive: true })

    const clipPath = await cutVideoSegment(videoPath, highlight.start, highlight.end, {
      outputDir: clipDir,
      outputName: clipName
    })

    const thumbnailFrames = await generateThumbnailFrames(
      videoPath,
      highlight,
      clipDir,
      options?.thumbnailFrameCount ?? DEFAULT_THUMBNAIL_FRAME_COUNT
    )

    const thumbnailPromptsFile = saveThumbnailPrompts(highlight.thumbnailPrompts ?? [], clipDir)

    results.push({
      clipDir,
      clip: { outputPath: clipPath, originalPath: videoPath },
      highlight,
      thumbnailFrames,
      thumbnailPromptsFile
    })
  }

  return results
}

/**
 * Re-frames a clip (or any video file) into a target export format's aspect
 * ratio (e.g. 9:16 for Reels/TikTok/Shorts), applying a quality preset. If the
 * source already matches the target aspect ratio, remuxes losslessly instead
 * of re-encoding.
 * @param inputPath - Path to the source video
 * @param formatId - Which entry of `EXPORT_FORMATS` to export to
 * @param qualityId - Which entry of `QUALITY_PRESETS` to use (only relevant when a re-encode is needed)
 * @param framing - `'crop'` fills the target frame and crops the overflow; `'blur-pad'` keeps the whole frame visible over a blurred, scaled-up copy of itself
 * @param outputDir - Optional output directory (defaults to input file directory)
 */
export async function exportClipToFormat(
  inputPath: string,
  formatId: ExportFormatId,
  qualityId: QualityPresetId,
  framing: FramingMode,
  outputDir?: string
): Promise<ConversionResult> {
  const outputPath = await exportClipToFormatInternal(inputPath, getExportFormat(formatId), getQualityPreset(qualityId), framing, {
    outputDir
  })
  return { outputPath, originalPath: inputPath }
}

/**
 * Compresses a video to fit under a target file size (in MB), by computing
 * the bitrate budget the video's duration allows and capping the encode with
 * `-maxrate`/`-bufsize` (single-pass rate-capping — result lands close to,
 * usually at or under, the target; not exact like true 2-pass encoding).
 * @param inputPath - Path to the source video
 * @param targetSizeMB - Desired maximum output size, in megabytes
 * @param options - Preset/CRF, audio bitrate/mono, optional downscale (maxHeight), output dir/name
 */
export async function compressVideoFile(
  inputPath: string,
  targetSizeMB: number,
  options?: CompressToTargetSizeOptions
): Promise<ConversionResult> {
  const outputPath = await compressVideoToTargetSize(inputPath, targetSizeMB, options)
  return { outputPath, originalPath: inputPath }
}

/**
 * Complete workflow: Extract audio + Transcribe with timeline + Ask an LLM for
 * the best highlights + Cut one clip per highlight.
 * @param videoPath - Path to the input video file
 * @param prompt - Free-text instructions describing what highlights to look for
 * @param aiOptions - Which AI provider/model/API key to use for highlight selection
 * @param options - Optional API keys, output directory, workflow flags and clip margin
 *
 * @example
 * await extractHighlightClips('interview.mp4', 'os 3 melhores momentos de humor', {
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-5-5',
 *   apiKey: process.env.ANTHROPIC_API_KEY!
 * }, { groqApiKey: process.env.GROQ_API_KEY, clipMarginSeconds: 2 })
 */
export async function extractHighlightClips(
  videoPath: string,
  prompt: string,
  aiOptions: HighlightAIOptions,
  options?: MediaScriptOptions & { clipMarginSeconds?: number; thumbnailFrameCount?: number }
): Promise<{
  outputDir: string
  extractedAudio: ConversionResult
  subtitles: SubtitlesResult
  highlights: HighlightSegment[]
  clips: HighlightClipResult[]
}> {
  // Every output for this video (audio, subtitles, clips, thumbnails) is grouped
  // into a single folder named after the video, since a highlights run generates many files.
  const outputDir = createOutputFolderForFile(videoPath, options?.outputDir)

  const extractedAudio = await extractAudioFromVideo(videoPath, outputDir)

  const subtitles = await generateSubtitles(extractedAudio.outputPath, { ...options, outputDir })
  if (!subtitles) {
    throw new Error('Não foi possível transcrever o áudio para gerar os destaques')
  }

  const highlights = await extractVideoHighlights(subtitles.segments, prompt, aiOptions)
  const clips = await cutHighlightClipsWithAssets(videoPath, highlights, outputDir, {
    marginSeconds: options?.clipMarginSeconds ?? 0,
    thumbnailFrameCount: options?.thumbnailFrameCount
  })

  return { outputDir, extractedAudio, subtitles, highlights, clips }
}

/**
 * Get the duration of an audio file in seconds
 * @param audioPath - Path to the audio file
 * @returns Promise with duration in seconds
 */
export async function getAudioFileDuration(audioPath: string): Promise<number> {
  return getAudioDuration(audioPath)
}

/**
 * Split an audio file into smaller chunks
 * @param audioPath - Path to the audio file
 * @param maxSizeMB - Maximum size per chunk in megabytes
 * @returns Promise with array of chunk file paths
 */
export async function splitAudioFile(
  audioPath: string,
  maxSizeMB: number = 10
): Promise<string[]> {
  return splitAudioIntoChunks(audioPath, maxSizeMB)
}

/**
 * Detect the type of a media file (video or audio)
 * @param filePath - Path to the file
 * @returns File type ('video' or 'audio')
 */
export function detectMediaFileType(filePath: string): FileType {
  return detectFileType(filePath)
}

/**
 * List all media files in a directory
 * @param directory - Path to the directory
 * @returns Array of media file information
 */
export function listMediaFilesInDirectory(directory: string): Array<{ name: string; fullPath: string; type: FileType }> {
  return listMediaFiles(directory)
}

/**
 * Complete workflow: Convert video + Extract audio + Transcribe
 *
 * When `options.skipVideoConversion` is `true`, skips the MP4 conversion step and
 * extracts audio directly from the original video file (e.g. .webm, .mkv, .mov).
 *
 * @param videoPath - Path to the input video file
 * @param outputDir - Optional output directory
 * @param options - Optional API keys, conversion options and workflow flags
 * @returns Promise with all results. `convertedVideo` is `null` when conversion was skipped.
 *
 * @example
 * // Full workflow (convert → extract audio → transcribe)
 * await processVideo('video.webm', './output', {
 *   conversionOptions: { preset: 'veryfast', hwaccel: 'auto' }
 * })
 *
 * @example
 * // Skip video conversion — extract audio directly and transcribe
 * await processVideo('video.webm', './output', {
 *   skipVideoConversion: true,
 *   groqApiKey: process.env.GROQ_API_KEY
 * })
 */
export async function processVideo(
  videoPath: string,
  options?: MediaScriptOptions
): Promise<{
  convertedVideo: ConversionResult | null
  extractedAudio: ConversionResult
  transcription: TranscriptionResult | null
}> {
  let convertedVideo: ConversionResult | null = null
  let sourceForAudio = videoPath

  if (!options?.skipVideoConversion) {
    // Convert video to a performant format first
    convertedVideo = await convertVideoFile(videoPath, options?.conversionOptions)
    sourceForAudio = convertedVideo.outputPath
  }

  // Extract audio from the converted video (or directly from the original)
  const extractedAudio = await extractAudioFromVideo(sourceForAudio, options?.outputDir)

  // Transcribe
  const transcription = await transcribeAudioFile(extractedAudio.outputPath, options)

  return {
    convertedVideo,
    extractedAudio,
    transcription
  }
}

/**
 * Complete workflow: Extract audio from video + Transcribe
 * @param videoPath - Path to the input video file
 * @param outputDir - Optional output directory
 * @param options - Optional API keys for transcription
 * @returns Promise with results
 */
export async function extractAndTranscribe(
  videoPath: string,
  options?: MediaScriptOptions
): Promise<{
  extractedAudio: ConversionResult
  transcription: TranscriptionResult | null
}> {
  // Extract audio
  const extractedAudio = await extractAudioFromVideo(videoPath, options?.outputDir)
  
  // Transcribe
  const transcription = await transcribeAudioFile(extractedAudio.outputPath, options)
  
  return {
    extractedAudio,
    transcription
  }
}

/**
 * Complete workflow: Convert audio + Transcribe
 * @param audioPath - Path to the input audio file
 * @param options - Optional API keys for transcription
 * @returns Promise with results
 */
export async function convertAndTranscribe(
  audioPath: string,
  options?: MediaScriptOptions
): Promise<{
  convertedAudio: ConversionResult
  transcription: TranscriptionResult | null
}> {
  // Convert audio
  const convertedAudio = await convertAudioFile(audioPath, options?.outputDir)
  
  // Transcribe
  const transcription = await transcribeAudioFile(convertedAudio.outputPath, options)
  
  return {
    convertedAudio,
    transcription
  }
}

// Re-export types for consumers
export type { Config, FileType, HighlightFallbackModel, HighlightChatMessage, HighlightChatTurnResult }
export type { ThemePreference } from './types/index.js'
