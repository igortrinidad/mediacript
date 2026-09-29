/**
 * Client for TypeSafe's Jev ("System One") API.
 *
 * Jev is not a text-generation model: it takes a `state` (text only) plus a set
 * of typed `questions` and returns typed answers with probabilities. That is why
 * it lives here rather than behind `createAIProvider` — there is no chat, no
 * free-form reply, no image input.
 *
 * Question types (https://docs.typesafe.ai/primitives):
 *  - choice: pick one option → `choice`, `probabilities`, `confidence`
 *  - score:  position on an ordered scale of 2–10 levels → `score` (probability-
 *            weighted level, a float), `probabilities`, `confidence`
 *  - noul:   yes/no → `noul`, the probability of "yes" (no confidence field)
 */
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
export const JEV_DEFAULT_MODEL = 'jev-latest'

/** 32k tokens are shared by `state` and the longest question; ~4 chars/token, leaving a wide margin. */
export const JEV_MAX_STATE_CHARS = 60_000

export interface JevChoiceQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<string, string | null>
}

export interface JevScoreQuestion {
  type: 'score'
  instructions: string
  /** Ordered low → high; level numbers are the array positions, starting at 0. */
  criteria: string[]
}

export interface JevNoulQuestion {
  type: 'noul'
  instructions: string
  criteria?: { true?: string; false?: string }
}

export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion

export interface JevChoiceAnswer {
  type: 'choice'
  choice: string
  confidence: number
  probabilities: Record<string, number>
}

export interface JevScoreAnswer {
  type: 'score'
  score: number
  confidence: number
  legend: Record<string, string>
  probabilities: Record<string, number>
}

export interface JevNoulAnswer {
  type: 'noul'
  noul: number
}

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer

export interface JevResponse {
  model: string
  answers: Record<string, JevAnswer>
  usage?: { input_tokens: number; output_tokens: number }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 2

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sends one `state` and all `questions` in a single call — Jev evaluates every
 * question in parallel and in isolation against that state. Retries rate limits
 * and 5xx with a short backoff; everything else fails immediately.
 */
export async function askJev(
  apiKey: string,
  state: string | Record<string, unknown>,
  questions: Record<string, JevQuestion>,
  model: string = JEV_DEFAULT_MODEL
): Promise<JevResponse> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1))

    let response: Response
    try {
      response = await fetch(JEV_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, model, questions }),
        signal: AbortSignal.timeout(60_000)
      })
    } catch (error) {
      lastError = new Error(`Falha de rede ao chamar o Jev: ${(error as Error).message}`)
      continue
    }

    if (response.ok) return (await response.json()) as JevResponse

    const detail = (await response.text()).slice(0, 300)
    lastError = new Error(
      response.status === 401 || response.status === 403
        ? 'O Jev recusou a API key (verifique a chave da TypeSafe em Settings).'
        : `Jev respondeu ${response.status}: ${detail || response.statusText}`
    )
    if (!RETRYABLE_STATUS.has(response.status)) throw lastError
  }

  throw lastError ?? new Error('Falha ao chamar o Jev')
}

/** Narrowing helpers — a mistyped answer means the API contract changed, which should fail loudly. */
export function expectChoice(response: JevResponse, key: string): JevChoiceAnswer {
  const answer = response.answers?.[key]
  if (answer?.type !== 'choice') throw new Error(`O Jev não devolveu a resposta "${key}" (choice).`)
  return answer
}

export function expectScore(response: JevResponse, key: string): JevScoreAnswer {
  const answer = response.answers?.[key]
  if (answer?.type !== 'score') throw new Error(`O Jev não devolveu a resposta "${key}" (score).`)
  return answer
}

export function expectNoul(response: JevResponse, key: string): JevNoulAnswer {
  const answer = response.answers?.[key]
  if (answer?.type !== 'noul') throw new Error(`O Jev não devolveu a resposta "${key}" (noul).`)
  return answer
}
