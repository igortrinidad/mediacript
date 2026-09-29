import { createAIProvider } from 'mediacript'
import type { AIProviderName } from 'mediacript'
import { buildCandidates } from './adChat'
import type { PersistedIgProject } from './igProjectStore'
import type { IgPost } from '../../shared/types'

const TYPE_LABELS: Record<IgPost['type'], string> = {
  reel: 'reel',
  video: 'vídeo',
  carousel: 'carrossel',
  image: 'imagem'
}

const MAX_CAPTION_CHARS = 1200
const MAX_TRANSCRIPT_CHARS = 2400

function truncate(text: string, max: number): string {
  const clean = text.trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function fmt(value: number | undefined): string {
  return value === undefined ? 'n/d' : value.toLocaleString('pt-BR')
}

/** Likes+comments as a share of followers — the only normalised engagement figure we can derive honestly. */
function engagementRate(post: IgPost, followers?: number): string {
  if (!followers || post.likes === undefined) return 'n/d'
  return `${(((post.likes + (post.comments ?? 0)) / followers) * 100).toFixed(2)}%`
}

function describePost(post: IgPost, index: number, followers?: number): string {
  const facts = [
    TYPE_LABELS[post.type],
    post.postedAt ? new Date(post.postedAt).toLocaleDateString('pt-BR') : '',
    `${fmt(post.likes)} curtidas`,
    `${fmt(post.comments)} comentários`,
    post.views !== undefined ? `${fmt(post.views)} views` : '',
    post.durationSeconds !== undefined ? `${Math.round(post.durationSeconds)}s` : '',
    `engajamento ${engagementRate(post, followers)}`
  ].filter(Boolean)

  return [
    `### Post ${index + 1} (${facts.join(', ')})`,
    `Legenda: ${truncate(post.caption || '(sem legenda)', MAX_CAPTION_CHARS)}`,
    post.hashtags.length ? `Hashtags: ${post.hashtags.map((tag) => `#${tag}`).join(' ')}` : '',
    post.transcript ? `Transcrição da fala: ${truncate(post.transcript, MAX_TRANSCRIPT_CHARS)}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** Profile card + every post, newest first. Shared by the analysis prompt and the chat so both see the same facts. */
export function buildProfileContext(project: PersistedIgProject): string {
  const { profile } = project
  const card = [
    `Perfil: @${profile.username}${profile.fullName ? ` (${profile.fullName})` : ''}${profile.verified ? ' — verificado' : ''}`,
    `Seguidores: ${fmt(profile.followers)} · Seguindo: ${fmt(profile.following)} · Posts no perfil: ${fmt(profile.postsCount)}`,
    profile.category ? `Categoria: ${profile.category}` : '',
    profile.biography ? `Bio: ${profile.biography}` : '',
    profile.externalUrl ? `Link na bio: ${profile.externalUrl}` : ''
  ].filter(Boolean)

  const dated = project.posts.filter((post) => post.postedAt).map((post) => new Date(post.postedAt!).getTime())
  const cadence =
    dated.length > 1
      ? `Cadência: ${project.posts.length} posts em ${Math.max(1, Math.round((Math.max(...dated) - Math.min(...dated)) / 86_400_000))} dias`
      : ''

  return [
    ...card,
    cadence,
    '',
    `Últimos ${project.posts.length} posts (do mais recente ao mais antigo):`,
    '',
    project.posts.length
      ? project.posts.map((post, index) => describePost(post, index, profile.followers)).join('\n\n')
      : '(nenhum post coletado)'
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
}

/**
 * Runs `messages` against the chosen model, then the user's configured
 * fallbacks in order — same policy as the ads and meetings chats.
 */
export async function runWithFallback(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  primary: { provider: AIProviderName; model: string },
  options: { temperature: number; maxTokens: number }
): Promise<{ text: string; provider: AIProviderName; model: string }> {
  let lastError: unknown

  for (const candidate of buildCandidates(primary)) {
    try {
      const provider = createAIProvider(candidate.provider, {
        apiKey: candidate.apiKey,
        model: candidate.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        timeout: 300000
      })
      const text = (await provider.run(messages))?.trim()
      if (!text) throw new Error('Resposta vazia do modelo')
      return { text, provider: candidate.provider, model: candidate.model }
    } catch (error) {
      lastError = error
      console.warn(`⚠️ Falha com ${candidate.provider}/${candidate.model}: ${(error as Error)?.message}. Tentando próximo modelo...`)
    }
  }

  throw new Error(`Nenhum modelo configurado conseguiu responder: ${(lastError as Error)?.message}`)
}
