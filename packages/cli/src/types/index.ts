import type { AIProviderName } from '../ai/types.js'

/** A provider/model pair the user picked to be tried as a highlights-AI fallback */
export interface HighlightFallbackModel {
  provider: AIProviderName
  model: string
}

/** UI theme preference for GUI consumers; `system` follows the OS setting */
export type ThemePreference = 'system' | 'light' | 'dark'

export interface Config {
  openaiApiKey?: string
  groqApiKey?: string
  anthropicApiKey?: string
  geminiApiKey?: string
  openrouterApiKey?: string
  /** Apify API token, used by the desktop app's winning-ads analyzer to pull ads from the Meta Ad Library */
  apifyApiKey?: string
  /** TypeSafe API key for the Jev typed-decision model, used by the desktop app's ads analyzer */
  jevApiKey?: string
  /**
   * Optional root directory for generated files, used by GUI consumers (e.g. the
   * desktop app, which writes `<root>/<módulo>/<datetime>_<nome>.<ext>`). When
   * empty the desktop app falls back to `<Documentos>/Mediacript`.
   */
  defaultOutputDir?: string
  /** UI theme chosen by the user in GUI consumers (e.g. the desktop app); defaults to `system` */
  theme?: ThemePreference
  /**
   * Ordered provider/model pairs tried, in order, if the primary highlights-AI call
   * (chosen per-run in the wizard) fails even after its own retries. Configured
   * once here instead of per-run since it rarely changes.
   */
  highlightFallbackModels?: HighlightFallbackModel[]
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface HighlightSegment {
  start: number
  end: number
  title: string
  reason?: string
  /** AI-suggested prompt ideas for generating a thumbnail image for this clip */
  thumbnailPrompts?: string[]
}

export interface WorkflowStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  result?: any
  error?: string
  startTime?: number
  endTime?: number
}

export interface WorkflowState {
  steps: WorkflowStep[]
  currentStepIndex: number
  inputFile: string
  intermediateFiles: {
    convertedVideo?: string
    extractedAudio?: string
    transcriptionText?: string
    subtitlesFile?: string
    highlightClips?: string[]
  }
}

export type OperationType = 'convert-video' | 'extract-audio' | 'convert-audio' | 'transcribe'

export interface Operation {
  type: OperationType
  name: string
  description: string
  requiresInput: 'video' | 'audio' | 'any'
}
