import type { DeepReadonly } from 'vue'
import type { IgPost, IgPostType, IgProfile } from '@shared/types'

const TYPE_LABELS: Record<IgPostType, string> = {
  reel: 'Reel',
  video: 'Vídeo',
  carousel: 'Carrossel',
  image: 'Imagem'
}

function number(value?: number): string {
  return value === undefined ? 'n/d' : value.toLocaleString('pt-BR')
}

/**
 * Plain-text dump of one post, laid out to be pasted into another prompt:
 * a metrics header followed by the caption and the speech transcript verbatim
 * (full text — the card truncates the caption, this does not).
 */
export function formatPostDetails(
  post: DeepReadonly<IgPost>,
  index: number,
  profile?: DeepReadonly<Pick<IgProfile, 'username' | 'followers'>>
): string {
  const isVideo = post.type === 'reel' || post.type === 'video'
  const engagement =
    profile?.followers && post.likes !== undefined
      ? `${(((post.likes + (post.comments ?? 0)) / profile.followers) * 100).toFixed(2)}% dos seguidores`
      : undefined

  const metrics = [
    `curtidas: ${number(post.likes)}`,
    `comentários: ${number(post.comments)}`,
    isVideo && post.views !== undefined ? `visualizações: ${number(post.views)}` : '',
    post.durationSeconds !== undefined ? `duração: ${Math.round(post.durationSeconds)}s` : '',
    engagement ? `engajamento: ${engagement}` : ''
  ].filter(Boolean)

  return [
    `Post ${index + 1} — ${TYPE_LABELS[post.type]}`,
    profile ? `Perfil: @${profile.username}${profile.followers ? ` (${number(profile.followers)} seguidores)` : ''}` : '',
    post.postedAt ? `Data: ${new Date(post.postedAt).toLocaleDateString('pt-BR')}` : '',
    `Link: ${post.url}`,
    `Métricas: ${metrics.join(' · ')}`,
    post.hashtags.length ? `Hashtags: ${post.hashtags.map((tag) => `#${tag}`).join(' ')}` : '',
    '',
    'Legenda:',
    post.caption.trim() || '(sem legenda)',
    ...(isVideo
      ? ['', 'Transcrição da fala:', post.transcript?.trim() || '(ainda não transcrito)']
      : [])
  ]
    .filter((line, position, all) => line !== '' || all[position - 1] !== '')
    .join('\n')
}

/** Every post separated by a rule, ready to paste as one block of context. */
export function formatAllPosts(
  posts: DeepReadonly<IgPost[]>,
  profile?: DeepReadonly<Pick<IgProfile, 'username' | 'followers'>>
): string {
  return posts.map((post, index) => formatPostDetails(post, index, profile)).join('\n\n---\n\n')
}
