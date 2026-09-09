import type {
  Config as MediacriptConfig,
  AIProviderName as MediacriptAIProviderName,
  HighlightFallbackModel as MediacriptHighlightFallbackModel,
  HighlightSegment as MediacriptHighlightSegment,
  TranscriptSegment as MediacriptTranscriptSegment,
  ExportFormatId as MediacriptExportFormatId,
  QualityPresetId as MediacriptQualityPresetId,
  FramingMode as MediacriptFramingMode,
  SubtitleMode as MediacriptSubtitleMode,
  ThemePreference as MediacriptThemePreference
} from 'mediacript'

// Reuse the root project's types (same shared config.json) instead of
// redefining a parallel shape that could drift out of sync.
export type Config = MediacriptConfig
export type AIProviderName = MediacriptAIProviderName
export type HighlightFallbackModel = MediacriptHighlightFallbackModel
export type HighlightSegment = MediacriptHighlightSegment
export type TranscriptSegment = MediacriptTranscriptSegment
export type ExportFormatId = MediacriptExportFormatId
export type QualityPresetId = MediacriptQualityPresetId
export type FramingMode = MediacriptFramingMode
export type SubtitleMode = MediacriptSubtitleMode
export type ThemePreference = MediacriptThemePreference

/** Where the app writes everything it generates — see main/lib/outputPaths.ts */
export interface OutputRootInfo {
  /** Root in use right now: the user's `defaultOutputDir`, or `defaultRoot` when unset */
  root: string
  /** Built-in default, `<Documentos>/Mediacript` */
  defaultRoot: string
  isDefault: boolean
}

export interface ExportOptionsInput {
  formats: ExportFormatId[]
  quality: QualityPresetId
  framing: FramingMode
}

export interface SubtitleOptionsInput {
  mode: SubtitleMode
}

export interface Agent {
  id: string
  name: string
  /** Main objective prompt, reused every time this agent starts a chat conversation */
  prompt: string
  exportOptions: ExportOptionsInput
  createdAt: string
  updatedAt: string
}

export interface AIProviderOption {
  provider: AIProviderName
  label: string
  models: string[]
  hasApiKey: boolean
}

export type FileKind = 'video' | 'audio'

export type OperationId =
  | 'video-full'
  | 'video-extract-transcribe'
  | 'video-convert'
  | 'video-extract'
  | 'video-subtitles'
  | 'video-subtitles-text'
  | 'video-apply-subtitles'
  | 'video-highlights'
  | 'video-highlights-chat'
  | 'audio-convert-transcribe'
  | 'audio-transcribe'
  | 'audio-convert'
  | 'audio-subtitles'
  | 'audio-subtitles-text'

/**
 * What produced a history entry. Runs driven by the Convert/Legendas wizard
 * carry their wizard operation id and can be replayed; the modules that work
 * outside the job runner (Comprimir, Screencast) carry their own id instead.
 */
export type HistoryOperation = OperationId | 'compress' | 'screencast'

export type ConversionPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow'

export interface ConversionOptionsInput {
  preset: ConversionPreset
  hwaccel: boolean
}

export interface HighlightOptionsInput {
  provider: AIProviderName
  model: string
  prompt: string
  marginSeconds: number
}

export interface JobRequest {
  operation: OperationId
  filePaths: string[]
  conversionOptions?: ConversionOptionsInput
  highlightOptions?: HighlightOptionsInput
  /** Extra platform formats (16:9, 9:16, Reels, TikTok, ...) to also export the final video output(s) into */
  exportOptions?: ExportOptionsInput
  subtitleOptions?: SubtitleOptionsInput
}

export type JobStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface JobStepState {
  name: string
  status: JobStepStatus
  error?: string
}

export interface JobEvent {
  jobId: string
  filePath: string
  fileIndex: number
  fileCount: number
  steps: JobStepState[]
  status: 'running' | 'completed' | 'failed'
  outputFiles?: string[]
  error?: string
}

export type JobLogLevel = 'log' | 'warn' | 'error' | 'progress'

/** A line of console output from the underlying library, mirrored live so the user can see what's actually happening during a job (ffmpeg progress, AI provider retries/fallbacks, etc.) */
export interface JobLogLine {
  jobId: string
  filePath: string
  level: JobLogLevel
  text: string
  timestamp: string
}

export interface HistoryEntry {
  id: string
  operation: HistoryOperation
  operationLabel: string
  inputFile: string
  outputFiles: string[]
  startedAt: string
  finishedAt: string
  status: 'completed' | 'failed'
  error?: string
  /** Options the job actually ran with, kept so it can be retried without retyping them */
  conversionOptions?: ConversionOptionsInput
  highlightOptions?: HighlightOptionsInput
  exportOptions?: ExportOptionsInput
  subtitleOptions?: SubtitleOptionsInput
}

/** What's needed to re-open the wizard pre-filled from a past history entry */
export interface RetryRequest {
  filePath: string
  operation: OperationId
  conversionOptions?: ConversionOptionsInput
  highlightOptions?: HighlightOptionsInput
  exportOptions?: ExportOptionsInput
  subtitleOptions?: SubtitleOptionsInput
}

export interface FfmpegStatus {
  installed: boolean
  version?: string
  error?: string
}

// --- Screencast -------------------------------------------------------------

export interface ScreenSource {
  id: string
  name: string
  thumbnailDataUrl: string
}

export type ScreencastControlAction = 'pause' | 'resume' | 'stop' | 'cancel'

export interface ScreencastControlWindowOptions {
  micEnabled: boolean
  cameraEnabled: boolean
}

export type CameraBubbleCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type CameraBubbleShape = 'circle' | 'rounded' | 'square'

export interface CameraBubbleOptions {
  corner: CameraBubbleCorner
  shape: CameraBubbleShape
  /** Bubble size as a ratio of the shorter canvas dimension */
  sizeRatio: number
  borderWidth: number
  borderColor: string
}

/**
 * How much size the optimized recording is allowed to spend. `whatsapp` keeps
 * the file under WhatsApp's media ceiling (dropping to 720p when a long
 * recording can't sustain 1080p at that budget), `balanced` is a middle ground
 * for e-mail/Drive, and `high` spends whatever 1080p actually needs.
 */
export type ScreencastQualityPreset = 'whatsapp' | 'balanced' | 'high'

export interface ScreencastProcessRequest {
  rawFilePath: string
  /** Recorded duration, used to size the bitrate budget of the optimized file. */
  durationSeconds: number
  /** Size/quality trade-off picked in the setup step. Defaults to `whatsapp`. */
  qualityPreset?: ScreencastQualityPreset
  /** False when the recording had no microphone, so the encoder can drop the audio budget. */
  hasAudio?: boolean
}

export interface ScreencastProcessResult {
  outputPath: string
  sizeBytes: number
  rawFilePath: string
  rawSizeBytes: number
}

export interface ScreencastProgressEvent {
  step: string
  status: 'running' | 'completed' | 'failed'
  detail?: string
}

/** Console/ffmpeg output mirrored live while a recording is being optimized — same shape the jobs and meetings panels consume. */
export interface ScreencastLogLine {
  level: JobLogLevel
  text: string
  timestamp: string
}

// --- Compress video ---------------------------------------------------------

export interface CompressRequest {
  inputPath: string
  /** Desired maximum output size, in megabytes */
  targetSizeMB: number
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow'
  /** Optional max output height (keeps aspect ratio). e.g. 720 */
  maxHeight?: number
  monoAudio?: boolean
}

export interface CompressResult {
  outputPath: string
  sizeBytes: number
}

// --- Highlight chat -------------------------------------------------------

export interface HighlightChatOptions {
  provider: AIProviderName
  model: string
}

export interface HighlightChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface HighlightChatStartRequest {
  jobId: string
  options: HighlightChatOptions
  agentId?: string
  /** The agent's main objective prompt, if one was selected — kept as system-level context for the whole conversation and auto-sent as the first turn so highlights appear without the user typing anything. */
  objective?: string
}

export interface HighlightChatStartResult {
  sessionId: string
  /** So the renderer can show a live transcript-text preview while the user drags a highlight's start/end sliders. */
  segments: TranscriptSegment[]
  /** URL (custom `mediacript-media://` scheme) an `<audio>` element can use directly as `src` to play the extracted audio. */
  audioUrl: string
  /** Present when an agent's objective prompt was auto-sent as the first turn — the renderer shows this instead of the generic greeting and doesn't need to wait for user input. */
  initialTurn?: { reply: string; highlights: HighlightSegment[] }
}

export interface ChatMessageEntry {
  role: 'user' | 'assistant'
  content: string
}

/** Full state needed to reopen (History → "Continuar conversa") a chat session exactly where it left off */
export interface HighlightChatResumeResult extends HighlightChatStartResult {
  history: ChatMessageEntry[]
  highlights: HighlightSegment[]
  agentId?: string
  exportOptions?: ExportOptionsInput
  status: 'active' | 'finished'
  outputFiles?: string[]
}

export interface ChatSessionSummary {
  id: string
  filePath: string
  agentId?: string
  status: 'active' | 'finished'
  messageCount: number
  highlightCount: number
  updatedAt: string
  outputFiles?: string[]
}

export interface HighlightChatSendRequest {
  sessionId: string
  message: string
}

export interface HighlightChatSendResult {
  reply: string
  highlights: HighlightSegment[]
}

export interface HighlightChatCutRequest {
  sessionId: string
  marginSeconds: number
  exportOptions?: ExportOptionsInput
}

export interface HighlightChatCutResult {
  outputFiles: string[]
}

/** A line of console/ffmpeg output mirrored live while `processCuts` runs, so the user can see it's actually working. */
export interface HighlightChatLogLine {
  sessionId: string
  level: JobLogLevel
  text: string
  timestamp: string
}

export interface HighlightChatRemoveRequest {
  sessionId: string
  index: number
}

export interface HighlightChatRemoveResult {
  highlights: HighlightSegment[]
}

export interface HighlightChatUpdateRequest {
  sessionId: string
  index: number
  start: number
  end: number
}

export interface HighlightChatUpdateResult {
  highlights: HighlightSegment[]
}

// --- Meetings ---------------------------------------------------------------

/**
 * How the "other side" of a meeting (whatever comes out of the speakers) gets
 * captured. `loopback` is Electron's native system-audio capture; `device` is
 * a regular input that happens to mirror the output (a PulseAudio monitor on
 * Linux, a virtual cable like BlackHole on macOS).
 */
export type SystemAudioMode = 'none' | 'loopback' | 'device'

export interface MeetingPlatformSupport {
  platform: string
  /** True where Electron can capture system audio by itself — Windows only, as of Electron 33. */
  loopbackSupported: boolean
  /** User-facing explanation of what this platform can and can't do. */
  note: string
}

export interface MeetingAudioSetup {
  micDeviceId?: string
  systemAudioMode: SystemAudioMode
  /** Input device to use when `systemAudioMode` is `'device'` (monitor/virtual cable). */
  systemAudioDeviceId?: string
}

export interface MeetingCreateRequest {
  title: string
  setup: MeetingAudioSetup
  provider: AIProviderName
  model: string
  agentId?: string
  /** The selected agent's prompt — steers what the minutes should focus on. */
  objective?: string
}

/** Each side of the conversation is recorded to its own file, which is what gives the transcript speaker labels. */
export type MeetingTrack = 'mic' | 'system'

export type MeetingStatus = 'recording' | 'processing' | 'ready' | 'failed'

export interface MeetingSegment {
  track: MeetingTrack
  start: number
  end: number
  text: string
}

export interface MeetingSummary {
  id: string
  title: string
  status: MeetingStatus
  durationSeconds: number
  createdAt: string
  updatedAt: string
  hasMinutes: boolean
  error?: string
}

export interface MeetingDetail extends MeetingSummary {
  provider: AIProviderName
  model: string
  agentId?: string
  objective?: string
  segments: MeetingSegment[]
  minutes?: string
  minutesFilePath?: string
  transcriptFilePath?: string
  history: ChatMessageEntry[]
  /** `mediacript-media://` URLs so the renderer can replay each track. */
  audio: { mic?: string; system?: string }
  folderPath: string
}

export interface MeetingProgressEvent {
  meetingId: string
  step: string
  status: 'running' | 'completed' | 'failed'
  detail?: string
}

/** Console/ffmpeg output mirrored live while a meeting is being processed. */
export interface MeetingLogLine {
  meetingId: string
  level: JobLogLevel
  text: string
  timestamp: string
}

export interface MeetingAskRequest {
  meetingId: string
  message: string
}

export interface MeetingAskResult {
  reply: string
}

export interface MeetingRegenerateRequest {
  meetingId: string
  /** Extra instruction for this pass ("foque nas decisões de produto", ...) — not persisted as the agent objective. */
  instructions?: string
}

export type MeetingControlAction = 'pause' | 'resume' | 'stop' | 'cancel'

export interface MeetingControlWindowOptions {
  micEnabled: boolean
  systemAudioEnabled: boolean
}
