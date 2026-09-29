import { createAIProvider, getStoredConfig } from 'mediacript'
import type { AIProviderName } from 'mediacript'
import { buildHighlightFallbackOptions, resolveHighlightApiKey } from './aiOptions'
import { loadProject, saveProject, type PersistedAdProject } from './adProjectStore'
import type { AdChatMessage, AdChatRequest, SavedAd } from '../../shared/types'

const HOOK_LABELS: Record<string, string> = {
  problem_agitate: 'problema + agitação',
  question: 'pergunta',
  bold_claim: 'afirmação ousada',
  social_proof: 'prova social',
  offer: 'oferta'
}

const OFFER_LABELS: Record<string, string> = {
  free_trial: 'teste grátis',
  discount: 'desconto',
  lead_magnet: 'isca digital',
  demo: 'demonstração',
  none: 'sem oferta'
}

const AWARENESS_LABELS = ['inconsciente', 'ciente do problema', 'ciente da solução', 'ciente do produto', 'totalmente ciente']

/** Room for a long brainstorm — ad scripts and several concepts easily pass the default. */
const MAX_REPLY_TOKENS = 6000
/** Only the tail of the conversation is replayed; the ads context is re-sent every turn anyway. */
const MAX_HISTORY_MESSAGES = 24
const MAX_ADS_IN_CONTEXT = 40
const MAX_TEXT_CHARS = 900
const MAX_TRANSCRIPT_CHARS = 1800

function truncate(text: string, max: number): string {
  const clean = text.trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/d' : `${Math.round(value * 100)}%`
}

function describeAd(ad: SavedAd, label: string): string {
  const { kpis, analysis } = ad
  const facts = [
    ad.mediaType === 'video' ? 'vídeo' : ad.mediaType === 'image' ? 'imagem' : 'outro formato',
    kpis.isActive ? 'ativo' : 'inativo',
    kpis.daysRunning !== undefined ? `${kpis.daysRunning} dias no ar` : '',
    kpis.variations ? `${kpis.variations} variações` : '',
    kpis.platforms.length ? kpis.platforms.join('/') : '',
    kpis.impressions ? `impressões ${kpis.impressions}` : '',
    kpis.spend ? `gasto ${kpis.spend}` : ''
  ].filter(Boolean)

  return [
    `### ${label} — ${ad.pageName} (${facts.join(', ')})`,
    ad.title ? `Título: ${ad.title}` : '',
    ad.ctaText ? `Botão: ${ad.ctaText}` : '',
    analysis
      ? `Análise: hook=${HOOK_LABELS[analysis.hook]}; consciência=${Number(analysis.awareness.toFixed(1))} (${AWARENESS_LABELS[Math.min(4, Math.max(0, Math.round(analysis.awareness)))]}); oferta=${OFFER_LABELS[analysis.offer_type]}; CTA claro=${percent(analysis.clear_cta)}; baixa fricção=${percent(analysis.friction_low)}`
      : 'Análise: ainda não analisado',
    `Texto do anúncio: ${truncate(ad.body || '(sem texto)', MAX_TEXT_CHARS)}`,
    ad.transcript
      ? `${ad.mediaType === 'video' ? 'Transcrição do vídeo' : 'Texto na imagem'}: ${truncate(ad.transcript, MAX_TRANSCRIPT_CHARS)}`
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Ads the chat may draw on. Labels ("Anúncio 3") follow the project's list
 * order, not the filtered order, so a reference the model made earlier keeps
 * pointing at the same ad when the selection changes. Longest-running first —
 * an ad that keeps getting budget is the best proxy for "winner" here.
 */
function selectAds(project: PersistedAdProject, adIds?: string[]): { ad: SavedAd; label: string }[] {
  const labeled = project.ads.map((ad, index) => ({ ad, label: `Anúncio ${index + 1}` }))
  const wanted = adIds?.length ? labeled.filter(({ ad }) => adIds.includes(ad.id)) : labeled.filter(({ ad }) => ad.analysis)
  const pool = wanted.length ? wanted : labeled

  return [...pool]
    .sort((a, b) => (b.ad.kpis.daysRunning ?? 0) - (a.ad.kpis.daysRunning ?? 0))
    .slice(0, MAX_ADS_IN_CONTEXT)
}

function buildSystemPrompt(project: PersistedAdProject, adIds?: string[]): string {
  const selected = selectAds(project, adIds)

  return [
    'Você é um estrategista criativo de mídia paga e copywriter de resposta direta, em português do Brasil.',
    'O usuário coletou anúncios da Meta Ad Library que considera vencedores e pediu a análise de cada um. Você conversa com ele sobre esses achados e ajuda a criar novos anúncios a partir deles.',
    project.description?.trim() ? `Contexto do projeto (definido pelo usuário): ${project.description.trim()}` : '',
    '',
    'Como responder:',
    '- Ao interpretar os achados, cite sempre os anúncios pelo rótulo (ex.: "Anúncio 3") e use os dados reais — hook, nível de consciência, oferta, CTA, tempo no ar. Nunca invente métricas que não estão abaixo.',
    '- Tempo no ar e número de variações são só indícios de performance, não prova: diga isso quando concluir algo a partir deles.',
    '- Ao criar novos anúncios, NÃO copie o texto dos originais: extraia o padrão (ângulo, estrutura, tipo de oferta, nível de consciência) e adapte ao produto/oferta do usuário.',
    '- Cada anúncio novo deve vir neste formato: **Conceito** (nome curto) · **Inspirado em** (anúncios) · **Hook** (estilo + a frase de abertura) · **Consciência alvo** · **Oferta** · **Roteiro ou criativo** (vídeo: cena a cena com tempo e fala; imagem: texto na arte, headline, texto principal) · **CTA** · **Por que deve funcionar**.',
    '- Se o usuário ainda não disse qual é o produto/oferta, proponha mesmo assim com placeholders claros entre colchetes e pergunte no fim o que precisa para refinar.',
    '- Seja direto, use Markdown simples (títulos, listas, negrito, tabelas) e sem preâmbulo.',
    '',
    `Anúncios do projeto "${project.name}" (${selected.length} em contexto):`,
    '',
    selected.length ? selected.map(({ ad, label }) => describeAd(ad, label)).join('\n\n') : '(nenhum anúncio salvo ainda)'
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
}

interface Candidate {
  provider: AIProviderName
  model: string
  apiKey: string
}

/** The chosen model first, then the user's configured fallbacks — same policy as the meetings chat. */
function buildCandidates(primary: { provider: AIProviderName; model: string }): Candidate[] {
  const config = getStoredConfig()
  const candidates: Candidate[] = []

  try {
    candidates.push({ ...primary, apiKey: resolveHighlightApiKey(primary.provider, config) })
  } catch {
    // No key for the chosen provider — the fallbacks below may still work.
  }

  for (const fallback of buildHighlightFallbackOptions(config, primary)) {
    candidates.push({ provider: fallback.provider as AIProviderName, model: fallback.model, apiKey: fallback.apiKey })
  }

  if (!candidates.length) {
    throw new Error(`Nenhuma API key configurada para "${primary.provider}" (nem para os modelos de fallback). Configure em Settings.`)
  }
  return candidates
}

export async function sendAdChatMessage(request: AdChatRequest): Promise<AdChatMessage[]> {
  const message = request.message.trim()
  if (!message) throw new Error('Escreva uma mensagem.')

  const project = loadProject(request.projectId)
  if (!project.ads.length) throw new Error('Salve ao menos um anúncio no projeto para conversar sobre os achados.')

  const history = project.chat ?? []
  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(project, request.adIds) },
    ...history.slice(-MAX_HISTORY_MESSAGES).map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user' as const, content: message }
  ]

  let reply: string | undefined
  let lastError: unknown

  for (const candidate of buildCandidates(request)) {
    try {
      const provider = createAIProvider(candidate.provider, {
        apiKey: candidate.apiKey,
        model: candidate.model,
        temperature: 0.7,
        maxTokens: MAX_REPLY_TOKENS,
        timeout: 300000
      })
      const text = (await provider.run(messages))?.trim()
      if (!text) throw new Error('Resposta vazia do modelo')
      reply = text
      break
    } catch (error) {
      lastError = error
      console.warn(`⚠️ Falha com ${candidate.provider}/${candidate.model}: ${(error as Error)?.message}. Tentando próximo modelo...`)
    }
  }

  if (!reply) throw new Error(`Nenhum modelo configurado conseguiu responder: ${(lastError as Error)?.message}`)

  // Re-load: analyses may have been saved while the model was thinking.
  const latest = loadProject(request.projectId)
  const now = new Date().toISOString()
  latest.chat = [
    ...(latest.chat ?? []),
    { role: 'user', content: message, createdAt: now },
    { role: 'assistant', content: reply, createdAt: new Date().toISOString() }
  ]
  saveProject(latest)

  return latest.chat
}

export function clearAdChat(projectId: string): void {
  const project = loadProject(projectId)
  project.chat = []
  saveProject(project)
}
