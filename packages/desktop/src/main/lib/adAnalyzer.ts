import fs from 'fs'
import path from 'path'
import { getStoredConfig, transcribeAudioFile } from 'mediacript'
import { captureConsole, type ConsoleLogLine } from './consoleCapture'
import { toTranscriptionAudio } from './meetingAudio'
import { assetPath, downloadAsset, loadProject, updateAd } from './adProjectStore'
import { JEV_DEFAULT_MODEL, JEV_MAX_STATE_CHARS, askJev, expectChoice, expectNoul, expectScore, type JevQuestion } from './jevClient'
import type { AdAnalysis, AdAnalysisEngine, AdProgressEvent, SavedAd } from '../../shared/types'

export interface AdAnalyzerCallbacks {
  onLog?: (line: ConsoleLogLine) => void
  onProgress?: (event: Omit<AdProgressEvent, 'projectId' | 'adId'>) => void
}

const HOOKS = ['problem_agitate', 'question', 'bold_claim', 'social_proof', 'offer'] as const
const OFFERS = ['free_trial', 'discount', 'lead_magnet', 'demo', 'none'] as const

/**
 * Gemini structured-output schema — one entry per field of `AdAnalysis`. The
 * `description` of each property is the question the model answers for that
 * field. `extracted_text` is not part of the analysis payload: it carries the
 * on-screen text of image ads back so it can be stored as their "transcript".
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    hook: {
      type: 'STRING',
      enum: [...HOOKS],
      description: 'What is the primary hook style?'
    },
    awareness: {
      type: 'INTEGER',
      description:
        'What customer awareness stage does this ad target (Schwartz)? 0 = unaware, 1 = problem aware, 2 = solution aware, 3 = product aware, 4 = most aware.'
    },
    offer_type: {
      type: 'STRING',
      enum: [...OFFERS],
      description: 'What is the main offer?'
    },
    clear_cta: {
      type: 'NUMBER',
      nullable: true,
      description: 'Is there a single, clear call to action? Probability from 0.0 to 1.0, null if it cannot be judged.'
    },
    friction_low: {
      type: 'NUMBER',
      nullable: true,
      description:
        'Does the ad reduce sign-up friction (e.g. free, no card, fast)? Probability from 0.0 to 1.0, null if it cannot be judged.'
    },
    extracted_text: {
      type: 'STRING',
      description: 'All legible text that appears inside the creative image, verbatim. Empty string if there is none.'
    }
  },
  required: ['hook', 'awareness', 'offer_type', 'clear_cta', 'friction_low', 'extracted_text']
}

const SYSTEM_PROMPT = [
  'Você é um analista sênior de mídia paga e copywriting de resposta direta.',
  'Você recebe um anúncio da Meta Ad Library (texto do anúncio, transcrição do áudio quando é vídeo, e a imagem/thumbnail do criativo) e classifica o anúncio de forma objetiva.',
  'Baseie-se exclusivamente no que está no anúncio — nunca invente ofertas ou promessas que não aparecem.',
  'Quando um campo não puder ser julgado com o material disponível, use null nos campos de probabilidade.',
  'Retorne apenas o JSON no schema pedido.'
].join('\n')

function mimeTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

function clamp01(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null
}

function buildUserText(ad: SavedAd, transcript?: string): string {
  return [
    `Página anunciante: ${ad.pageName}`,
    `Formato: ${ad.mediaType}`,
    ad.title ? `Título: ${ad.title}` : '',
    ad.ctaText ? `Botão (CTA): ${ad.ctaText}` : '',
    ad.linkUrl ? `Link de destino: ${ad.linkUrl}` : '',
    '',
    'Texto do anúncio:',
    ad.body?.trim() || '(sem texto)',
    ...(transcript ? ['', 'Transcrição do áudio do vídeo:', transcript] : [])
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
}

/** One structured Gemini call over the ad's text, transcript and image. Thinking is left at the model's default; the token budget leaves room for it. */
async function callGemini(
  apiKey: string,
  model: string,
  userText: string,
  imagePath?: string
): Promise<AdAnalysis & { extracted_text: string }> {
  const parts: Record<string, unknown>[] = [{ text: userText }]
  if (imagePath) {
    parts.push({
      inlineData: { mimeType: mimeTypeFor(imagePath), data: fs.readFileSync(imagePath).toString('base64') }
    })
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA
        }
      }),
      signal: AbortSignal.timeout(180_000)
    }
  )

  if (!response.ok) {
    throw new Error(`Gemini respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`)
  }

  const data: any = await response.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('')
  if (!text?.trim()) throw new Error('Resposta vazia da Gemini')

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('A Gemini não devolveu um JSON válido — tente novamente.')
  }

  if (!HOOKS.includes(parsed.hook) || !OFFERS.includes(parsed.offer_type)) {
    throw new Error('A Gemini devolveu valores fora do schema esperado — tente novamente.')
  }

  return {
    hook: parsed.hook,
    awareness: Math.min(4, Math.max(0, Math.round(Number(parsed.awareness) || 0))),
    offer_type: parsed.offer_type,
    clear_cta: clamp01(parsed.clear_cta),
    friction_low: clamp01(parsed.friction_low),
    extracted_text: typeof parsed.extracted_text === 'string' ? parsed.extracted_text.trim() : ''
  }
}

// --- Jev engine -------------------------------------------------------------------

/**
 * The same five questions as the Gemini schema, expressed as Jev primitives.
 * Instructions and criteria are in English — Jev is most accurate there — while
 * the ad content it reads may be Portuguese.
 */
const JEV_QUESTIONS: Record<string, JevQuestion> = {
  hook: {
    type: 'choice',
    instructions: 'What is the primary hook style of this ad, i.e. how does it grab attention in its opening?',
    criteria: {
      problem_agitate: 'Opens by naming a pain point or problem and making it feel more painful or urgent',
      question: 'Opens with a question aimed directly at the viewer',
      bold_claim: 'Opens with a striking, surprising, or superlative claim or promise',
      social_proof: 'Opens with testimonials, customer numbers, results, authority, or endorsements',
      offer: 'Opens with the offer itself: a price, discount, free trial, or bonus'
    }
  },
  awareness: {
    type: 'score',
    instructions: 'What customer awareness stage does this ad target (Eugene Schwartz)?',
    criteria: [
      'Unaware: the audience does not know they have a problem; the ad leads with curiosity or a story',
      'Problem aware: the audience feels the problem but does not know solutions exist',
      'Solution aware: the audience knows solutions exist but not this product',
      'Product aware: the audience knows this product and needs a reason to choose it',
      'Most aware: the audience is ready to buy and only needs the deal or a nudge'
    ]
  },
  offer_type: {
    type: 'choice',
    instructions: 'What is the main offer of this ad?',
    criteria: {
      free_trial: 'A free trial or free period of the product or service',
      discount: 'A price cut, promotion, coupon, or limited-time deal',
      lead_magnet: 'A free resource in exchange for contact details (ebook, checklist, class, webinar, quiz)',
      demo: 'A demonstration, consultation, or call to see the product working',
      none: 'No concrete offer; the ad only builds awareness or pushes the brand'
    }
  },
  clear_cta: {
    type: 'noul',
    instructions: 'Is there a single, clear call to action?',
    criteria: {
      true: 'Exactly one specific action is asked of the viewer (e.g. sign up, buy, book)',
      false: 'No call to action, or several competing ones'
    }
  },
  friction_low: {
    type: 'noul',
    instructions: 'Does the ad reduce sign-up friction (e.g. free, no card, fast)?',
    criteria: {
      true: 'Signals that getting started is free, fast, easy, or risk-free',
      false: 'Says nothing about effort or risk, or implies a demanding process or commitment'
    }
  }
}

const OCR_MODEL = 'gemini-3.5-flash-lite'

/**
 * Jev only reads text, so an image ad's on-screen text has to be extracted
 * first. Plain (non-structured) Gemini call; returns '' when there is nothing to read.
 */
async function extractImageText(apiKey: string, imagePath: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${OCR_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Transcribe verbatim all legible text that appears inside this ad image, in reading order. Reply with the text only. If there is no text, reply with an empty string.'
              },
              { inlineData: { mimeType: mimeTypeFor(imagePath), data: fs.readFileSync(imagePath).toString('base64') } }
            ]
          }
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 }
      }),
      signal: AbortSignal.timeout(120_000)
    }
  )

  if (!response.ok) throw new Error(`Gemini respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`)

  const data: any = await response.json()
  return (data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('') ?? '').trim()
}

/** The ad as the JSON `state` Jev evaluates. Empty fields are dropped so they don't read as content. */
function buildJevState(ad: SavedAd, transcript?: string, imageText?: string): Record<string, unknown> {
  const state: Record<string, unknown> = {
    advertiser: ad.pageName,
    format: ad.mediaType,
    headline: ad.title,
    primary_text: ad.body?.trim(),
    cta_button: ad.ctaText,
    destination_url: ad.linkUrl,
    video_audio_transcript: transcript,
    text_inside_image: imageText
  }

  for (const key of Object.keys(state)) if (!state[key]) delete state[key]

  // Keep a pathological transcript from blowing the 32k-token state budget.
  const serialized = JSON.stringify(state)
  if (serialized.length > JEV_MAX_STATE_CHARS && typeof state.video_audio_transcript === 'string') {
    state.video_audio_transcript = state.video_audio_transcript.slice(0, Math.max(0, JEV_MAX_STATE_CHARS - (serialized.length - state.video_audio_transcript.length)))
  }
  return state
}

async function callJev(apiKey: string, ad: SavedAd, transcript?: string, imageText?: string): Promise<AdAnalysis> {
  const response = await askJev(apiKey, buildJevState(ad, transcript, imageText), JEV_QUESTIONS)

  const hook = expectChoice(response, 'hook')
  const awareness = expectScore(response, 'awareness')
  const offer = expectChoice(response, 'offer_type')

  if (!HOOKS.includes(hook.choice as (typeof HOOKS)[number]) || !OFFERS.includes(offer.choice as (typeof OFFERS)[number])) {
    throw new Error('O Jev devolveu uma opção fora das esperadas — tente novamente.')
  }

  return {
    hook: hook.choice as AdAnalysis['hook'],
    // Probability-weighted level (e.g. 2.4) — kept as a float rather than rounded, since the spread is the signal.
    awareness: Math.round(Math.min(4, Math.max(0, awareness.score)) * 100) / 100,
    offer_type: offer.choice as AdAnalysis['offer_type'],
    clear_cta: clamp01(expectNoul(response, 'clear_cta').noul),
    friction_low: clamp01(expectNoul(response, 'friction_low').noul),
    confidence: { hook: hook.confidence, awareness: awareness.confidence, offer_type: offer.confidence }
  }
}

/**
 * Analyzes one saved ad: pulls its assets, gets a transcript (Whisper for video
 * audio), then produces the structured payload with the chosen engine:
 *  - `jev`: TypeSafe's typed-decision model — text only, so image ads are OCR'd
 *    with Gemini first; returns confidences alongside each answer.
 *  - `gemini`: one structured multimodal call that also reads the image itself.
 * A failed transcription is not fatal — the ad copy (and thumbnail, for Gemini)
 * is still enough for a useful read, so it is logged and skipped.
 */
export async function analyzeAd(
  projectId: string,
  adId: string,
  engine: AdAnalysisEngine,
  model: string,
  callbacks: AdAnalyzerCallbacks = {}
): Promise<SavedAd> {
  const config = getStoredConfig()
  if (engine === 'gemini' && !config.geminiApiKey) {
    throw new Error('Configure a API key da Google Gemini em Settings para analisar anúncios.')
  }
  if (engine === 'jev' && !config.jevApiKey) {
    throw new Error('Configure a API key da TypeSafe (Jev) em Settings › Chaves de API para analisar anúncios.')
  }

  const project = loadProject(projectId)
  const ad = project.ads.find((entry) => entry.id === adId)
  if (!ad) throw new Error('Anúncio não encontrado neste projeto.')

  updateAd(projectId, adId, { status: 'analyzing', error: undefined })
  const stopCapture = callbacks.onLog ? captureConsole(callbacks.onLog) : undefined
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    callbacks.onProgress?.({ step: name, status: 'running' })
    try {
      const result = await run()
      callbacks.onProgress?.({ step: name, status: 'completed' })
      return result
    } catch (error) {
      callbacks.onProgress?.({ step: name, status: 'failed', detail: (error as Error).message })
      throw error
    }
  }

  try {
    let transcript: string | undefined
    let imagePath: string | undefined

    // Visual reference for the model: the image itself, or the video's preview frame.
    const visualUrl = ad.mediaType === 'image' ? (ad.imageUrl ?? ad.thumbnailUrl) : ad.thumbnailUrl
    if (visualUrl) {
      imagePath = await step('Baixando imagem do criativo', () =>
        downloadAsset(visualUrl, assetPath(project, ad.id, ad.mediaType === 'image' ? 'image' : 'thumb', visualUrl))
      )
    }

    if (ad.mediaType === 'video' && ad.videoUrl) {
      const videoUrl = ad.videoUrl
      const videoPath = await step('Baixando vídeo', () =>
        downloadAsset(videoUrl, assetPath(project, ad.id, 'video', videoUrl))
      )

      try {
        transcript = await step('Transcrevendo o áudio', async () => {
          const mp3 = await toTranscriptionAudio(videoPath, path.join(project.folderPath, `${ad.id}_audio.mp3`), (line) =>
            callbacks.onLog?.({ level: 'progress', text: line })
          )
          const result = await transcribeAudioFile(mp3)
          if (!result) throw new Error('Verifique as API keys do Groq/OpenAI em Settings.')
          return result.text.trim()
        })
        fs.rmSync(path.join(project.folderPath, `${ad.id}_audio.mp3`), { force: true })
      } catch (error) {
        console.warn(`⚠️ Sem transcrição para este anúncio (${(error as Error).message}). Analisando só com texto e imagem.`)
      }
    }

    let analysis: AdAnalysis
    let imageText = ''
    let analysisModel = model

    if (engine === 'jev') {
      // Jev can't see: image ads (and video ads with no usable transcript) get their on-screen text read first.
      if (imagePath && ad.mediaType === 'image') {
        if (config.geminiApiKey) {
          imageText = await step('Lendo o texto da imagem', () => extractImageText(config.geminiApiKey!, imagePath!)).catch(
            (error) => {
              console.warn(`⚠️ Não foi possível ler o texto da imagem (${(error as Error).message}). Analisando só com o texto do anúncio.`)
              return ''
            }
          )
        } else {
          console.warn('⚠️ Sem chave do Gemini para ler o texto da imagem — analisando só com o texto do anúncio.')
        }
      }

      analysis = await step('Analisando com Jev', () => callJev(config.jevApiKey!, ad, transcript, imageText))
      analysisModel = JEV_DEFAULT_MODEL
    } else {
      const { extracted_text, ...structured } = await step('Analisando com Gemini', () =>
        callGemini(config.geminiApiKey!, model, buildUserText(ad, transcript), imagePath)
      )
      analysis = structured
      imageText = extracted_text
    }

    const updated = updateAd(projectId, adId, {
      status: 'analyzed',
      analysis,
      analysisModel,
      analysisEngine: engine,
      analyzedAt: new Date().toISOString(),
      // Videos keep their speech transcript; images get the text read off the creative.
      transcript: transcript || imageText || undefined,
      error: undefined
    })
    return updated.ads.find((entry) => entry.id === adId)!
  } catch (error) {
    const message = (error as Error)?.message || 'Falha ao analisar o anúncio'
    updateAd(projectId, adId, { status: 'failed', error: message })
    throw error
  } finally {
    stopCapture?.()
  }
}
