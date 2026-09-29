import type { AdHookStyle, AdOfferType } from '@shared/types'

export const HOOK_LABELS: Record<AdHookStyle, string> = {
  problem_agitate: 'Problema + agitação',
  question: 'Pergunta',
  bold_claim: 'Afirmação ousada',
  social_proof: 'Prova social',
  offer: 'Oferta'
}

export const OFFER_LABELS: Record<AdOfferType, string> = {
  free_trial: 'Teste grátis',
  discount: 'Desconto',
  lead_magnet: 'Isca digital',
  demo: 'Demonstração',
  none: 'Sem oferta'
}

/** Schwartz's five customer-awareness stages, indexed by the model's 0–4 score. */
export const AWARENESS_LABELS = ['Inconsciente', 'Ciente do problema', 'Ciente da solução', 'Ciente do produto', 'Totalmente ciente']

export const COUNTRIES: { code: string; label: string }[] = [
  { code: 'BR', label: 'Brasil' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'PT', label: 'Portugal' },
  { code: 'GB', label: 'Reino Unido' },
  { code: 'ES', label: 'Espanha' },
  { code: 'MX', label: 'México' },
  { code: 'ALL', label: 'Todos os países' }
]
