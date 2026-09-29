<script setup lang="ts">
import { computed, type DeepReadonly } from 'vue'
import type { AdItem, SavedAd, TranscriptionEngineUsed } from '@shared/types'
import { useClipboard } from '../../composables/useClipboard'
import { formatAdDetails } from './adDetails'
import { AWARENESS_LABELS, HOOK_LABELS, OFFER_LABELS } from './labels'

const props = defineProps<{
  ad: DeepReadonly<AdItem | SavedAd>
  /** `search`: result not in the project yet. `saved`: lives in the project and can be analyzed. */
  mode: 'search' | 'saved'
  alreadySaved?: boolean
  /** Position in the project list — the label used in copied details and in the chat ("Anúncio 3"). */
  index?: number
  busy?: boolean
  progressText?: string
}>()

const emit = defineEmits<{
  save: []
  remove: []
  analyze: []
  transcribe: []
}>()

const { copiedKey, copy } = useClipboard()

const ENGINE_LABELS: Record<TranscriptionEngineUsed, string> = {
  groq: 'Groq Whisper (direto)',
  openai: 'OpenAI (direto)',
  gemini: 'Gemini (vídeo direto)',
  local: 'Local (ffmpeg + Whisper)'
}

const saved = computed(() => (props.mode === 'saved' ? (props.ad as DeepReadonly<SavedAd>) : null))
const thumbnail = computed(() => saved.value?.localThumbnailUrl ?? props.ad.thumbnailUrl)
const analysis = computed(() => saved.value?.analysis)

function awarenessLabel(value: number): string {
  return AWARENESS_LABELS[Math.min(4, Math.max(0, Math.round(value)))]
}

/** Jev's confidence in its pick, when the analysis has one (Gemini analyses don't). */
function confidence(value: number | undefined): string {
  return value === undefined ? '' : ` · conf. ${Math.round(value * 100)}%`
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`
}

function openLibrary(): void {
  window.open(props.ad.libraryUrl)
}
</script>

<template>
  <article class="ad-card card">
    <div class="media">
      <img v-if="thumbnail" :src="thumbnail" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <div v-else class="no-media">sem prévia</div>
      <span class="type-badge">{{ ad.mediaType === 'video' ? '🎬 Vídeo' : ad.mediaType === 'image' ? '🖼️ Imagem' : 'Outro' }}</span>
    </div>

    <div class="body">
      <header>
        <strong class="page">{{ ad.pageName }}</strong>
        <span class="status" :class="{ on: ad.kpis.isActive }">{{ ad.kpis.isActive ? 'Ativo' : 'Inativo' }}</span>
      </header>

      <p class="copy">{{ ad.body || '(sem texto)' }}</p>

      <ul class="kpis">
        <li v-if="ad.kpis.daysRunning !== undefined">📅 {{ ad.kpis.daysRunning }} dia(s) no ar</li>
        <li v-if="ad.kpis.variations">🧬 {{ ad.kpis.variations }} variação(ões)</li>
        <li v-if="ad.kpis.platforms.length">📣 {{ ad.kpis.platforms.join(', ') }}</li>
        <li v-if="ad.kpis.impressions">👁️ {{ ad.kpis.impressions }}</li>
        <li v-if="ad.kpis.reach">🎯 alcance {{ ad.kpis.reach.toLocaleString('pt-BR') }}</li>
        <li v-if="ad.kpis.spend">💰 {{ ad.kpis.spend }}</li>
        <li v-if="ad.ctaText">🔘 {{ ad.ctaText }}</li>
      </ul>

      <section v-if="analysis" class="analysis">
        <div class="chip"><span>Hook{{ confidence(analysis.confidence?.hook) }}</span>{{ HOOK_LABELS[analysis.hook] }}</div>
        <div class="chip">
          <span>Consciência{{ confidence(analysis.confidence?.awareness) }}</span>{{ Number(analysis.awareness.toFixed(1)) }} · {{ awarenessLabel(analysis.awareness) }}
        </div>
        <div class="chip"><span>Oferta{{ confidence(analysis.confidence?.offer_type) }}</span>{{ OFFER_LABELS[analysis.offer_type] }}</div>
        <div class="chip"><span>CTA claro</span>{{ percent(analysis.clear_cta) }}</div>
        <div class="chip"><span>Baixa fricção</span>{{ percent(analysis.friction_low) }}</div>
      </section>

      <p v-if="saved?.analysisEngine" class="engine">Analisado com {{ saved.analysisEngine === 'jev' ? 'Jev' : 'Gemini' }} ({{ saved.analysisModel }})</p>

      <details v-if="saved?.transcript" class="transcript" open>
        <summary>{{ ad.mediaType === 'video' ? 'Transcrição do vídeo' : 'Texto extraído da imagem' }}</summary>
        <p v-if="saved.transcriptEngine" class="engine">
          {{ ENGINE_LABELS[saved.transcriptEngine] }}{{ saved.transcriptSeconds !== undefined ? ` · ${saved.transcriptSeconds}s` : '' }}
        </p>
        <button class="btn btn-ghost small copy-inline" type="button" @click="copy('transcript', saved.transcript)">
          {{ copiedKey === 'transcript' ? 'Copiado!' : 'Copiar transcrição' }}
        </button>
        <p>{{ saved.transcript }}</p>
      </details>

      <p v-if="progressText" class="progress">⏳ {{ progressText }}</p>
      <p v-if="saved?.status === 'failed' && saved.error" class="error-text">{{ saved.error }}</p>

      <footer>
        <button class="btn btn-ghost small" type="button" @click="openLibrary">Ver na Ad Library ↗</button>
        <button class="btn small" type="button" @click="copy('details', formatAdDetails(ad, index))">
          {{ copiedKey === 'details' ? 'Copiado!' : '📋 Copiar detalhes' }}
        </button>
        <template v-if="mode === 'search'">
          <button class="btn btn-primary small" type="button" :disabled="alreadySaved || busy" @click="emit('save')">
            {{ alreadySaved ? '✓ Salvo' : busy ? 'Salvando…' : '+ Salvar no projeto' }}
          </button>
        </template>
        <template v-else>
          <button
            v-if="!saved?.transcript && ad.mediaType !== 'other'"
            class="btn btn-ghost small"
            type="button"
            :disabled="busy"
            @click="emit('transcribe')"
          >
            {{ ad.mediaType === 'video' ? 'Transcrever' : 'Ler texto da imagem' }}
          </button>
          <button class="btn small" type="button" :disabled="busy" @click="emit('analyze')">
            {{ saved?.status === 'analyzed' ? 'Reanalisar' : 'Analisar' }}
          </button>
          <button class="btn btn-ghost small" type="button" :disabled="busy" @click="emit('remove')">Remover</button>
        </template>
      </footer>
    </div>
  </article>
</template>

<style scoped>
.ad-card {
  display: flex;
  gap: 14px;
  padding: 12px;
}

.media {
  position: relative;
  flex: 0 0 150px;
  height: 190px;
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

.type-badge {
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
  gap: 8px;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.page {
  font-size: 13px;
}

.status {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

.status.on {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 15%, transparent);
}

.copy {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  user-select: text;
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

.analysis {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 9px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.chip span {
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}

.engine {
  margin: 0;
  font-size: 10px;
  color: var(--text-muted);
}

.transcript {
  font-size: 12px;
}

.transcript summary {
  cursor: pointer;
  color: var(--text-muted);
}

.transcript p {
  margin: 6px 0 0;
  line-height: 1.5;
  max-height: 160px;
  overflow-y: auto;
  user-select: text;
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
  gap: 6px;
  margin-top: auto;
}

.small {
  font-size: 11px;
  padding: 5px 9px;
}
</style>
