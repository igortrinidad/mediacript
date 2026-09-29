<script setup lang="ts">
import { computed, ref, type DeepReadonly } from 'vue'
import type { IgPost, IgProfile } from '@shared/types'
import { useClipboard } from '../../composables/useClipboard'
import { formatPostDetails } from './postDetails'

const props = defineProps<{
  post: DeepReadonly<IgPost>
  index: number
  /** Profile the post belongs to — adds the username and engagement rate to the copied details. */
  profile?: DeepReadonly<Pick<IgProfile, 'username' | 'followers'>>
  busy?: boolean
  progressText?: string
}>()

const emit = defineEmits<{
  transcribe: []
}>()

const TYPE_LABELS: Record<IgPost['type'], string> = {
  reel: '🎬 Reel',
  video: '🎞️ Vídeo',
  carousel: '🗂️ Carrossel',
  image: '🖼️ Imagem'
}

const { copiedKey, copy } = useClipboard()
const captionExpanded = ref(false)

const isVideo = computed(() => props.post.type === 'reel' || props.post.type === 'video')
const thumbnail = computed(() => props.post.localThumbnailUrl ?? props.post.displayUrl)

const engagement = computed(() => {
  const followers = props.profile?.followers
  if (!followers || props.post.likes === undefined) return null
  return (((props.post.likes + (props.post.comments ?? 0)) / followers) * 100).toFixed(2)
})

function fmt(value?: number): string {
  return value === undefined ? '—' : value.toLocaleString('pt-BR')
}

function openPost(): void {
  window.open(props.post.url)
}
</script>

<template>
  <article class="post card">
    <div class="media">
      <img v-if="thumbnail" :src="thumbnail" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <div v-else class="no-media">sem prévia</div>
      <span class="badge">{{ TYPE_LABELS[post.type] }}</span>
    </div>

    <div class="body">
      <header>
        <strong>Post {{ index + 1 }}</strong>
        <span v-if="post.postedAt" class="date">{{ new Date(post.postedAt).toLocaleDateString('pt-BR') }}</span>
      </header>

      <p
        class="caption"
        :class="{ expanded: captionExpanded }"
        :title="captionExpanded ? 'Recolher legenda' : 'Ver legenda completa'"
        @click="captionExpanded = !captionExpanded"
      >
        {{ post.caption || '(sem legenda)' }}
      </p>

      <ul class="kpis">
        <li>❤️ {{ fmt(post.likes) }}</li>
        <li>💬 {{ fmt(post.comments) }}</li>
        <li v-if="isVideo && post.views !== undefined">👁️ {{ fmt(post.views) }}</li>
        <li v-if="post.durationSeconds !== undefined">⏱️ {{ Math.round(post.durationSeconds) }}s</li>
        <li v-if="engagement">📈 {{ engagement }}% dos seguidores</li>
      </ul>

      <p v-if="post.hashtags.length" class="tags">{{ post.hashtags.map((tag) => `#${tag}`).join(' ') }}</p>

      <details v-if="post.transcript" class="transcript">
        <summary>Transcrição da fala</summary>
        <button class="btn btn-ghost small copy-inline" type="button" @click="copy('transcript', post.transcript)">
          {{ copiedKey === 'transcript' ? 'Copiado!' : 'Copiar transcrição' }}
        </button>
        <p>{{ post.transcript }}</p>
      </details>

      <p v-if="progressText" class="progress">⏳ {{ progressText }}</p>
      <p v-else-if="post.transcriptError" class="error-text">{{ post.transcriptError }}</p>

      <footer>
        <button class="btn btn-ghost small" type="button" @click="openPost">Abrir no Instagram ↗</button>
        <button class="btn small" type="button" @click="copy('details', formatPostDetails(post, index, profile))">
          {{ copiedKey === 'details' ? 'Copiado!' : '📋 Copiar detalhes' }}
        </button>
        <button v-if="post.caption" class="btn btn-ghost small" type="button" @click="copy('caption', post.caption)">
          {{ copiedKey === 'caption' ? 'Copiado!' : 'Copiar legenda' }}
        </button>
        <button v-if="isVideo" class="btn small" type="button" :disabled="busy" @click="emit('transcribe')">
          {{ post.transcript ? 'Transcrever de novo' : 'Transcrever' }}
        </button>
      </footer>
    </div>
  </article>
</template>

<style scoped>
.post {
  display: flex;
  gap: 14px;
  padding: 12px;
}

.media {
  position: relative;
  flex: 0 0 120px;
  height: 150px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--border);
}

.media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-media {
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--text-muted);
}

.badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: white;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
}

.date {
  font-size: 11px;
  color: var(--text-muted);
}

.caption {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  cursor: pointer;
  user-select: text;
}

.caption.expanded {
  display: block;
  -webkit-line-clamp: unset;
}

.kpis {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 11px;
  color: var(--text-muted);
}

.tags {
  margin: 0;
  font-size: 11px;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transcript {
  font-size: 12px;
}

.transcript summary {
  cursor: pointer;
  font-weight: 600;
}

.transcript p {
  margin: 6px 0 0;
  white-space: pre-wrap;
  user-select: text;
  color: var(--text-muted);
}

.copy-inline {
  margin-top: 4px;
}

.progress {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.error-text {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
}

.small {
  font-size: 11px;
  padding: 5px 9px;
}
</style>
