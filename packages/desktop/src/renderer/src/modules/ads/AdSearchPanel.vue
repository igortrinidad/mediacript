<script setup lang="ts">
import { reactive, ref, type DeepReadonly } from 'vue'
import type { AdItem, AdSearchRequest } from '@shared/types'
import AdCard from './AdCard.vue'
import { COUNTRIES } from './labels'

defineProps<{
  savedIds: DeepReadonly<string[]>
  /** Id of the ad currently being saved by the parent, so its button shows progress. */
  savingId: string | null
}>()

const emit = defineEmits<{
  save: [ad: AdItem]
}>()

const form = reactive({
  keywords: '',
  pageUrls: '',
  country: 'BR',
  mediaType: 'all' as AdSearchRequest['mediaType'],
  activeStatus: 'active' as AdSearchRequest['activeStatus'],
  limit: 20
})

const results = ref<AdItem[]>([])
const searching = ref(false)
const searched = ref(false)
const error = ref('')

async function search(): Promise<void> {
  error.value = ''
  searching.value = true
  try {
    results.value = await window.api.ads.search({
      keywords: form.keywords,
      pageUrls: form.pageUrls.split('\n').map((line) => line.trim()).filter(Boolean),
      country: form.country,
      mediaType: form.mediaType,
      activeStatus: form.activeStatus,
      limit: Math.min(100, Math.max(1, Number(form.limit) || 20))
    })
    searched.value = true
  } catch (err: any) {
    error.value = err?.message || 'Falha ao buscar anúncios'
  } finally {
    searching.value = false
  }
}
</script>

<template>
  <div class="search">
    <form class="card filters" @submit.prevent="search">
      <div class="field wide">
        <label for="kw">Palavras-chave (uma por linha ou separadas por vírgula)</label>
        <input id="kw" v-model="form.keywords" type="text" placeholder="Ex.: emagrecer, curso de inglês" />
      </div>
      <div class="field wide">
        <label for="pages">Páginas ou URLs da Ad Library (uma por linha)</label>
        <textarea id="pages" v-model="form.pageUrls" rows="2" placeholder="https://www.facebook.com/nomedapagina" />
      </div>

      <div class="field">
        <label for="country">País</label>
        <select id="country" v-model="form.country">
          <option v-for="country in COUNTRIES" :key="country.code" :value="country.code">{{ country.label }}</option>
        </select>
      </div>
      <div class="field">
        <label for="media">Formato</label>
        <select id="media" v-model="form.mediaType">
          <option value="all">Vídeo e imagem</option>
          <option value="video">Só vídeo</option>
          <option value="image">Só imagem</option>
        </select>
      </div>
      <div class="field">
        <label for="status">Status</label>
        <select id="status" v-model="form.activeStatus">
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos</option>
        </select>
      </div>
      <div class="field">
        <label for="limit">Máx. de ads (por busca)</label>
        <input id="limit" v-model.number="form.limit" type="number" min="1" max="100" />
      </div>

      <div class="field wide">
        <button class="btn btn-primary" type="submit" :disabled="searching || (!form.keywords.trim() && !form.pageUrls.trim())">
          {{ searching ? 'Buscando na Apify… (pode levar 1–3 min)' : '🔎 Buscar anúncios' }}
        </button>
      </div>
    </form>

    <p v-if="error" class="error-text">{{ error }}</p>
    <p v-if="searched && !results.length && !error" class="hint">Nenhum anúncio encontrado com esses filtros.</p>

    <div class="results">
      <AdCard
        v-for="ad in results"
        :key="ad.id"
        :ad="ad"
        mode="search"
        :already-saved="savedIds.includes(ad.id)"
        :busy="savingId === ad.id"
        @save="emit('save', ad)"
      />
    </div>
  </div>
</template>

<style scoped>
.search {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.filters {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px 12px;
  padding: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.field.wide {
  grid-column: 1 / -1;
}

.field label {
  font-size: 11px;
  color: var(--text-muted);
}

.results {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}
</style>
