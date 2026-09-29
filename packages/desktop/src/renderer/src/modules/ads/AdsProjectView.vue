<script setup lang="ts">
import { modelOptionLabel } from '../../shared/modelLabel'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { AdAnalysisEngine, AdHookStyle, AdItem, AdOfferType, AdProjectDetail } from '@shared/types'
import { useSettings } from '../../composables/useSettings'
import { toPlain } from '../../shared/toPlain'
import AdCard from './AdCard.vue'
import AdSearchPanel from './AdSearchPanel.vue'
import AdsChatPanel from './AdsChatPanel.vue'
import { useClipboard } from '../../composables/useClipboard'
import { formatAllAds } from './adDetails'
import { AWARENESS_LABELS, HOOK_LABELS, OFFER_LABELS } from './labels'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  back: []
}>()

const { state: settings, load: loadSettings } = useSettings()
const { copiedKey, copy } = useClipboard()

const project = ref<AdProjectDetail | null>(null)
const tab = ref<'saved' | 'search' | 'chat'>('saved')
const error = ref('')
const savingId = ref<string | null>(null)
/** Gemini model: the analysis model for the `gemini` engine, and the image-text reader for `jev`. */
const model = ref('gemini-3.8-flash')
const engine = ref<AdAnalysisEngine>('jev')
/** adId → latest progress step text, for ads being analyzed right now */
const progress = reactive<Record<string, string>>({})
const analyzingAll = ref(false)

const geminiModels = computed(() => settings.aiProviders.find((p) => p.provider === 'gemini')?.models ?? [])
const geminiPricing = computed(() => settings.aiProviders.find((p) => p.provider === 'gemini')?.pricing)
const hasGeminiKey = computed(() => !!settings.config.geminiApiKey)
const hasJevKey = computed(() => !!settings.config.jevApiKey)
const canAnalyze = computed(() => (engine.value === 'jev' ? hasJevKey.value : hasGeminiKey.value))
const hasApifyKey = computed(() => !!settings.config.apifyApiKey)
const savedIds = computed(() => project.value?.ads.map((ad) => ad.id) ?? [])
const pendingAds = computed(() => project.value?.ads.filter((ad) => ad.status !== 'analyzed') ?? [])
const analyzedAds = computed(() => project.value?.ads.filter((ad) => ad.analysis) ?? [])

let unsubscribeProgress: (() => void) | null = null

onMounted(async () => {
  await loadSettings()
  // Jev is the default engine; fall back to Gemini when only that key is set.
  if (!settings.config.jevApiKey && settings.config.geminiApiKey) engine.value = 'gemini'
  if (!geminiModels.value.includes(model.value) && geminiModels.value.length) model.value = geminiModels.value[0]
  unsubscribeProgress = window.api.ads.onProgress((event) => {
    if (event.projectId !== props.projectId) return
    if (event.status === 'running') progress[event.adId] = event.step
    else if (event.status === 'failed') delete progress[event.adId]
  })
  await reload()
})

onBeforeUnmount(() => unsubscribeProgress?.())

async function reload(): Promise<void> {
  try {
    project.value = await window.api.ads.getProject(props.projectId)
    // No saved ads yet: the natural first step is searching for some.
    if (!project.value.ads.length) tab.value = 'search'
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível abrir o projeto'
  }
}

async function saveAd(ad: AdItem): Promise<void> {
  error.value = ''
  savingId.value = ad.id
  try {
    project.value = await window.api.ads.saveAd(props.projectId, toPlain(ad))
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível salvar o anúncio'
  } finally {
    savingId.value = null
  }
}

async function removeAd(adId: string): Promise<void> {
  project.value = await window.api.ads.removeAd(props.projectId, adId)
}

async function analyze(adId: string): Promise<void> {
  error.value = ''
  progress[adId] = 'Iniciando…'
  try {
    await window.api.ads.analyze({ projectId: props.projectId, adId, engine: engine.value, model: model.value })
  } catch (err: any) {
    error.value = err?.message || 'Falha ao analisar o anúncio'
  } finally {
    delete progress[adId]
    await reload()
  }
}

async function transcribe(adId: string): Promise<void> {
  error.value = ''
  progress[adId] = 'Iniciando…'
  try {
    await window.api.ads.transcribe(props.projectId, adId)
  } catch (err: any) {
    error.value = err?.message || 'Falha ao transcrever o anúncio'
  } finally {
    delete progress[adId]
    await reload()
  }
}

/** Sequential on purpose: each run captures console output and hits paid APIs — parallel runs would interleave logs and rate limits. */
async function analyzeAll(): Promise<void> {
  analyzingAll.value = true
  try {
    for (const ad of [...pendingAds.value]) await analyze(ad.id)
  } finally {
    analyzingAll.value = false
  }
}

// --- Insights across the analyzed ads ---------------------------------------------

function distribution<K extends string>(values: K[]): { key: K; count: number }[] {
  const counts = new Map<K, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
}

function average(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number')
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null
}

const insights = computed(() => {
  const analyses = analyzedAds.value.map((ad) => ad.analysis!)
  if (!analyses.length) return null

  const awareness = average(analyses.map((a) => a.awareness))
  return {
    total: analyses.length,
    hooks: distribution<AdHookStyle>(analyses.map((a) => a.hook)),
    offers: distribution<AdOfferType>(analyses.map((a) => a.offer_type)),
    awareness,
    awarenessLabel: awareness === null ? '' : AWARENESS_LABELS[Math.min(4, Math.max(0, Math.round(awareness)))],
    clearCta: average(analyses.map((a) => a.clear_cta)),
    frictionLow: average(analyses.map((a) => a.friction_low))
  }
})

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}
</script>

<template>
  <div class="project">
    <header class="head">
      <button class="btn btn-ghost back" type="button" @click="emit('back')">← Projetos</button>
      <div>
        <h2>{{ project?.name ?? 'Carregando…' }}</h2>
        <p v-if="project?.description" class="hint">{{ project.description }}</p>
      </div>
    </header>

    <p v-if="error" class="error-text">{{ error }}</p>
    <p v-if="!hasApifyKey" class="warn">Configure o token da Apify em Settings › Chaves de API para buscar anúncios.</p>
    <p v-if="engine === 'jev' && !hasJevKey" class="warn">Configure a chave da TypeSafe (Jev) em Settings › Chaves de API para analisar anúncios.</p>
    <p v-if="engine === 'gemini' && !hasGeminiKey" class="warn">Configure a chave do Google Gemini em Settings › Chaves de API para analisar anúncios.</p>
    <p v-if="engine === 'jev' && hasJevKey && !hasGeminiKey" class="warn">Sem a chave do Gemini, anúncios em imagem serão analisados só pelo texto do anúncio (o Jev não lê imagens).</p>

    <nav class="tabs">
      <button class="tab" :class="{ active: tab === 'saved' }" type="button" @click="tab = 'saved'">
        Salvos ({{ project?.ads.length ?? 0 }})
      </button>
      <button class="tab" :class="{ active: tab === 'search' }" type="button" @click="tab = 'search'">🔎 Buscar na Ad Library</button>
      <button class="tab" :class="{ active: tab === 'chat' }" type="button" @click="tab = 'chat'">💬 Chat</button>
    </nav>

    <AdSearchPanel v-show="tab === 'search'" :saved-ids="savedIds" :saving-id="savingId" @save="saveAd" />

    <AdsChatPanel
      v-if="project"
      v-show="tab === 'chat'"
      :project-id="project.id"
      :ads="project.ads"
      :messages="project.chat"
      @updated="project.chat = $event"
    />

    <div v-show="tab === 'saved'" class="saved">
      <section v-if="insights" class="card insights">
        <h3>Padrões dos {{ insights.total }} ads analisados</h3>
        <div class="insight-grid">
          <div>
            <span class="label">Hooks</span>
            <div v-for="row in insights.hooks" :key="row.key" class="bar-row">
              <span>{{ HOOK_LABELS[row.key] }}</span>
              <div class="bar"><div class="fill" :style="{ width: `${(row.count / insights.total) * 100}%` }" /></div>
              <b>{{ row.count }}</b>
            </div>
          </div>
          <div>
            <span class="label">Ofertas</span>
            <div v-for="row in insights.offers" :key="row.key" class="bar-row">
              <span>{{ OFFER_LABELS[row.key] }}</span>
              <div class="bar"><div class="fill" :style="{ width: `${(row.count / insights.total) * 100}%` }" /></div>
              <b>{{ row.count }}</b>
            </div>
          </div>
          <div class="averages">
            <span class="label">Médias</span>
            <p>Consciência: <b>{{ insights.awareness?.toFixed(1) ?? '—' }}</b> · {{ insights.awarenessLabel }}</p>
            <p>CTA claro: <b>{{ percent(insights.clearCta) }}</b></p>
            <p>Baixa fricção: <b>{{ percent(insights.frictionLow) }}</b></p>
          </div>
        </div>
      </section>

      <div v-if="project?.ads.length" class="toolbar">
        <label for="engine">Motor</label>
        <select id="engine" v-model="engine">
          <option value="jev">Jev (TypeSafe) — probabilidades e confiança</option>
          <option value="gemini">Gemini — leitura visual direta</option>
        </select>
        <template v-if="engine === 'gemini'">
          <label for="model">Modelo</label>
          <select id="model" v-model="model">
            <option v-for="m in geminiModels" :key="m" :value="m">{{ modelOptionLabel(m, geminiPricing) }}</option>
          </select>
        </template>
        <button class="btn" type="button" @click="copy('all-ads', formatAllAds(project.ads))">
          {{ copiedKey === 'all-ads' ? 'Copiado!' : '📋 Copiar todos' }}
        </button>
        <button
          class="btn btn-primary"
          type="button"
          :disabled="analyzingAll || !pendingAds.length || !canAnalyze"
          @click="analyzeAll"
        >
          {{ analyzingAll ? 'Analisando…' : `Analisar pendentes (${pendingAds.length})` }}
        </button>
      </div>

      <p v-if="project && !project.ads.length" class="hint">
        Nenhum anúncio salvo ainda. Use a aba “Buscar na Ad Library” e salve os que você gostou.
      </p>

      <AdCard
        v-for="(ad, index) in project?.ads ?? []"
        :key="ad.id"
        :ad="ad"
        mode="saved"
        :index="index"
        :busy="!!progress[ad.id]"
        :progress-text="progress[ad.id]"
        @analyze="analyze(ad.id)"
        @transcribe="transcribe(ad.id)"
        @remove="removeAd(ad.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.project {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.head h2 {
  font-size: 17px;
  margin: 0;
}

.back {
  font-size: 12px;
  padding: 5px 9px;
}

.hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.warn {
  margin: 0;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text);
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
}

.tab {
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  border-bottom: 2px solid transparent;
}

.tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.saved {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar label {
  font-size: 12px;
  color: var(--text-muted);
}

.insights {
  padding: 14px;
}

.insights h3 {
  font-size: 13px;
  margin: 0 0 10px;
}

.insight-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 18px;
}

.label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.bar-row {
  display: grid;
  grid-template-columns: 1fr 60px 16px;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 4px;
}

.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--accent);
}

.averages p {
  margin: 0 0 4px;
  font-size: 12px;
}
</style>
