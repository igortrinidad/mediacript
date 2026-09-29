import fs from 'fs'
import path from 'path'
import { getStoredConfig, transcribeAudioFile } from 'mediacript'
import { toTranscriptionAudio } from './meetingAudio'
import type { TranscriptionEngine, TranscriptionEngineUsed } from '../../shared/types'

/**
 * Video → transcript, shared by the Ads and Instagram modules.
 *
 * POC of sending the video file straight to a provider instead of converting it
 * locally first:
 *  - `groq` / `openai`: multipart upload of the mp4 to their Whisper-family
 *    endpoints, which accept mp4 directly (25 MB cap). No ffmpeg involved.
 *  - `gemini`: the mp4 goes inline to a multimodal Gemini model, which hears the
 *    speech *and* reads on-screen text — something Whisper never sees.
 *  - `local`: the previous pipeline (ffmpeg → mp3 → mediacript's Whisper helper,
 *    which also chunks big files). Kept for comparison and as the fallback for
 *    videos too large for the direct routes.
 */
export interface VideoTranscriptionOptions {
  engine: TranscriptionEngine
  /** Scratch folder for the local engine's temporary mp3. */
  workDir: string
  onLog?: (text: string) => void
}

export interface VideoTranscriptionResult {
  text: string
  engine: TranscriptionEngineUsed
  seconds: number
}

/** Whisper endpoints reject uploads above this. */
const WHISPER_MAX_BYTES = 25 * 1024 * 1024
/** Inline base64 keeps the whole request under Gemini's 100 MB limit with margin (base64 adds ~33%). */
const GEMINI_INLINE_MAX_BYTES = 50 * 1024 * 1024

const GROQ_MODEL = 'whisper-large-v3-turbo'
const OPENAI_MODEL = 'gpt-transcribe'
const GEMINI_VIDEO_MODEL = 'gemini-3.8-flash'

export const ENGINE_LABELS: Record<TranscriptionEngineUsed, string> = {
  groq: 'Groq Whisper (direto)',
  openai: 'OpenAI (direto)',
  gemini: 'Gemini (vídeo direto)',
  local: 'Local (ffmpeg + Whisper)'
}

type Config = ReturnType<typeof getStoredConfig>

/**
 * `auto` prefers the cheapest direct route that has a key and fits the size cap
 * (Groq → OpenAI → Gemini) and only falls back to the local pipeline when
 * none does. An explicit engine is honored or fails loudly — silently switching
 * would defeat the point of comparing them.
 */
function resolveEngine(engine: TranscriptionEngine, sizeBytes: number, config: Config): TranscriptionEngineUsed {
  const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`

  if (engine === 'auto') {
    if (config.groqApiKey && sizeBytes <= WHISPER_MAX_BYTES) return 'groq'
    if (config.openaiApiKey && sizeBytes <= WHISPER_MAX_BYTES) return 'openai'
    if (config.geminiApiKey && sizeBytes <= GEMINI_INLINE_MAX_BYTES) return 'gemini'
    return 'local'
  }

  if (engine === 'groq' || engine === 'openai') {
    if (!(engine === 'groq' ? config.groqApiKey : config.openaiApiKey)) {
      throw new Error(`Configure a API key da ${engine === 'groq' ? 'Groq' : 'OpenAI'} em Settings para usar este motor.`)
    }
    if (sizeBytes > WHISPER_MAX_BYTES) {
      throw new Error(`O vídeo tem ${mb(sizeBytes)} e o limite de upload direto é 25 MB. Use o motor Gemini ou Local.`)
    }
  }

  if (engine === 'gemini') {
    if (!config.geminiApiKey) throw new Error('Configure a API key da Google Gemini em Settings para usar este motor.')
    if (sizeBytes > GEMINI_INLINE_MAX_BYTES) {
      throw new Error(`O vídeo tem ${mb(sizeBytes)}; o envio direto ao Gemini nesta POC vai até 50 MB. Use o motor Local.`)
    }
  }

  return engine
}

async function errorDetail(response: Response): Promise<string> {
  return (await response.text()).slice(0, 300) || response.statusText
}

/** Multipart upload of the mp4 to an OpenAI-compatible `/audio/transcriptions` endpoint. */
async function transcribeWithWhisperApi(
  url: string,
  apiKey: string,
  model: string,
  videoPath: string,
  label: string
): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(videoPath)], { type: 'video/mp4' }), path.basename(videoPath))
  form.append('model', model)
  form.append('response_format', 'json')

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(300_000)
  })

  if (!response.ok) throw new Error(`${label} respondeu ${response.status}: ${await errorDetail(response)}`)

  const data: any = await response.json()
  return String(data?.text ?? '').trim()
}

/**
 * The whole video goes to Gemini in one request. Speech and on-screen text are
 * asked for separately (structured output) so the text overlays — often where
 * an ad's actual offer lives — don't get blended into the spoken transcript.
 */
async function transcribeWithGemini(apiKey: string, videoPath: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VIDEO_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Watch this video and return two things.',
                  '1. speech: a verbatim transcript of everything spoken, in the language it was spoken. No summary, no timestamps, no speaker labels. Empty string if nobody speaks.',
                  '2. on_screen_text: the text that appears on screen (titles, captions, overlays, prices, buttons), in order of appearance, one item per line, without repeating the same text. Empty string if there is none.'
                ].join('\n')
              },
              { inlineData: { mimeType: 'video/mp4', data: fs.readFileSync(videoPath).toString('base64') } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          // Frames are only needed to read text; low resolution cuts the per-second token cost.
          mediaResolution: 'MEDIA_RESOLUTION_LOW',
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { speech: { type: 'STRING' }, on_screen_text: { type: 'STRING' } },
            required: ['speech', 'on_screen_text']
          }
        }
      }),
      signal: AbortSignal.timeout(300_000)
    }
  )

  if (!response.ok) throw new Error(`Gemini respondeu ${response.status}: ${await errorDetail(response)}`)

  const data: any = await response.json()
  const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('')
  if (!raw?.trim()) throw new Error('Resposta vazia da Gemini')

  let parsed: { speech?: string; on_screen_text?: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('A Gemini não devolveu um JSON válido — tente novamente.')
  }

  const speech = (parsed.speech ?? '').trim()
  const onScreen = (parsed.on_screen_text ?? '').trim()
  return onScreen ? `${speech}${speech ? '\n\n' : ''}[Texto na tela]\n${onScreen}` : speech
}

/** The pre-POC pipeline: ffmpeg to a small mp3, then mediacript's Whisper helper (which also chunks). */
async function transcribeLocally(videoPath: string, workDir: string, onLog?: (text: string) => void): Promise<string> {
  const mp3Path = path.join(workDir, `${path.basename(videoPath, path.extname(videoPath))}_audio.mp3`)
  try {
    const mp3 = await toTranscriptionAudio(videoPath, mp3Path, onLog)
    const result = await transcribeAudioFile(mp3)
    if (!result) throw new Error('Verifique as API keys do Groq/OpenAI em Settings.')
    return result.text.trim()
  } finally {
    fs.rmSync(mp3Path, { force: true })
  }
}

export async function transcribeVideo(videoPath: string, options: VideoTranscriptionOptions): Promise<VideoTranscriptionResult> {
  const config = getStoredConfig()
  const size = fs.statSync(videoPath).size
  const engine = resolveEngine(options.engine, size, config)

  options.onLog?.(`Transcrevendo com ${ENGINE_LABELS[engine]} (${(size / 1024 / 1024).toFixed(1)} MB)…`)
  const startedAt = Date.now()

  let text: string
  switch (engine) {
    case 'groq':
      text = await transcribeWithWhisperApi('https://api.groq.com/openai/v1/audio/transcriptions', config.groqApiKey!, GROQ_MODEL, videoPath, 'Groq')
      break
    case 'openai':
      text = await transcribeWithWhisperApi('https://api.openai.com/v1/audio/transcriptions', config.openaiApiKey!, OPENAI_MODEL, videoPath, 'OpenAI')
      break
    case 'gemini':
      text = await transcribeWithGemini(config.geminiApiKey!, videoPath)
      break
    case 'local':
      text = await transcribeLocally(videoPath, options.workDir, options.onLog)
      break
  }

  const seconds = Math.round((Date.now() - startedAt) / 100) / 10
  options.onLog?.(`Transcrito com ${ENGINE_LABELS[engine]} em ${seconds}s.`)
  return { text, engine, seconds }
}
