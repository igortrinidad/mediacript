import type { AIProviderName } from './types.js'

/**
 * Curated list of accepted models per provider. Kept intentionally small —
 * pick the current flagship/fast/cheap tiers instead of mirroring every
 * model a provider exposes, since these lists go straight into CLI prompts.
 */
export const ANTHROPIC_MODELS = [
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5-20251001',
  'claude-fable-5'
] as const

export const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview'
] as const

export const OPENROUTER_MODELS = [
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-sonnet-4.5',
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
  'deepseek/deepseek-chat',
  'meta-llama/llama-3.3-70b-instruct'
] as const

export const OPENAI_MODELS = [
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini'
] as const

export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct'
] as const

export type AnthropicModel = typeof ANTHROPIC_MODELS[number]
export type GeminiModel = typeof GEMINI_MODELS[number]
export type OpenRouterModel = typeof OPENROUTER_MODELS[number]
export type OpenAIModel = typeof OPENAI_MODELS[number]
export type GroqModel = typeof GROQ_MODELS[number]
export type AIModel = AnthropicModel | GeminiModel | OpenRouterModel | OpenAIModel | GroqModel

export const AI_MODELS_BY_PROVIDER: Record<AIProviderName, readonly string[]> = {
  anthropic: ANTHROPIC_MODELS,
  gemini: GEMINI_MODELS,
  openrouter: OPENROUTER_MODELS,
  openai: OPENAI_MODELS,
  groq: GROQ_MODELS
}

/** Standard list price of a model, in USD per 1M tokens. */
export interface ModelPrice {
  input: number
  output: number
  /** Short caveat worth showing next to the price (promo end date, long-context surcharge, ...). */
  note?: string
}

/** When the table below was last checked against each provider's pricing page. */
export const MODEL_PRICING_AS_OF = '2026-09-29'

/**
 * Standard (non-batch, non-cached) list prices in USD per 1M tokens, as published
 * by each provider. Models missing here simply show no price — better than a
 * guess (e.g. Groq lists Llama 3.3 70B / 3.1 8B as "contact sales" only).
 * OpenRouter entries are a snapshot of its live per-model price and can drift.
 */
export const MODEL_PRICING: Record<AIProviderName, Record<string, ModelPrice>> = {
  anthropic: {
    'claude-fable-5-1': { input: 10, output: 50 },
    'claude-opus-5-5': { input: 4, output: 20 },
    'claude-sonnet-5-5': { input: 2, output: 10 },
    'claude-opus-4-8': { input: 5, output: 25 },
    'claude-sonnet-5': { input: 2, output: 10 },
    'claude-haiku-4-5-20251001': { input: 1, output: 5 },
    'claude-fable-5': { input: 10, output: 50 }
  },
  gemini: {
    'gemini-3.8-flash': { input: 0.75, output: 3.75, note: 'promo até 31/12/2026, depois dobra' },
    'gemini-3.1-pro-preview': { input: 2, output: 12, note: 'dobra acima de 200k tokens' },
    'gemini-3.5-flash': { input: 1.5, output: 9 },
    'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
    'gemini-2.5-pro': { input: 1.25, output: 10, note: 'dobra acima de 200k tokens' },
    'gemini-2.5-flash': { input: 0.3, output: 2.5 },
    'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
    'gemini-3-flash-preview': { input: 0.5, output: 3 }
  },
  openrouter: {
    'anthropic/claude-sonnet-5.5': { input: 2, output: 10 },
    'anthropic/claude-sonnet-4.5': { input: 3, output: 15 },
    'google/gemini-2.5-flash': { input: 0.3, output: 2.5 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
    'deepseek/deepseek-chat': { input: 0.257, output: 1.029 },
    'meta-llama/llama-3.3-70b-instruct': { input: 0.1, output: 0.32 }
  },
  openai: {
    'gpt-6-astra': { input: 10, output: 50 },
    'gpt-6-sol': { input: 2, output: 10 },
    'gpt-6-luna': { input: 0.1, output: 0.5 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 }
  },
  groq: {
    'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
    'openai/gpt-oss-20b': { input: 0.075, output: 0.3 }
  }
}

/** Price of a model, or undefined for custom/unpriced ids. */
export function getModelPrice(provider: AIProviderName, model: string): ModelPrice | undefined {
  return MODEL_PRICING[provider]?.[model]
}

export const AI_PROVIDER_LABELS: Record<AIProviderName, string> = {
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google (Gemini)',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  groq: 'Groq'
}
