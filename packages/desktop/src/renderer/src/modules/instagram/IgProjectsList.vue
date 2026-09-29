<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSettings } from '../../composables/useSettings'
import { useIgProjects } from './composables/useIgProjects'

const emit = defineEmits<{
  open: [id: string]
}>()

const { state, load, create, remove } = useIgProjects()
const { state: settings, load: loadSettings } = useSettings()

const username = ref('')
const description = ref('')
const limit = ref(16)
const creating = ref(false)
const confirmingId = ref<string | null>(null)
const error = ref('')

const hasApifyKey = computed(() => !!settings.config.apifyApiKey)

onMounted(() => {
  void load()
  void loadSettings()
})

async function submit(): Promise<void> {
  error.value = ''
  creating.value = true
  try {
    const id = await create(username.value, limit.value, description.value)
    username.value = ''
    description.value = ''
    emit('open', id)
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível coletar o perfil'
  } finally {
    creating.value = false
  }
}

async function confirmRemove(id: string): Promise<void> {
  confirmingId.value = null
  await remove(id)
}

function compact(value?: number): string {
  return value === undefined ? '—' : new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value)
}
</script>

<template>
  <div class="projects">
    <header class="head">
      <h2>📸 Analisador de perfil do Instagram</h2>
      <p class="hint">
        Informe um perfil público: baixamos os últimos posts, transcrevemos os reels, analisamos o estilo e ajudamos você a
        criar novos posts.
      </p>
    </header>

    <p v-if="!hasApifyKey" class="warn">Configure o token da Apify em Settings › Chaves de API para coletar perfis.</p>

    <form class="card create-form" @submit.prevent="submit">
      <label for="ig-user">Perfil (@usuario ou link)</label>
      <input id="ig-user" v-model="username" type="text" placeholder="@perfil" :disabled="creating" />
      <label for="ig-desc">Objetivo (opcional)</label>
      <input id="ig-desc" v-model="description" type="text" placeholder="Ex.: concorrente direto, referência de estilo" :disabled="creating" />
      <div class="row">
        <label for="ig-limit" class="inline">Posts</label>
        <input id="ig-limit" v-model.number="limit" type="number" min="1" max="50" class="limit" :disabled="creating" />
        <button class="btn btn-primary" type="submit" :disabled="creating || !username.trim() || !hasApifyKey">
          {{ creating ? 'Coletando… (1–3 min)' : 'Analisar perfil' }}
        </button>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
    </form>

    <p v-if="state.loaded && !state.projects.length" class="hint center">Nenhum perfil analisado ainda.</p>

    <ul class="list">
      <li v-for="project in state.projects" :key="project.id" class="item">
        <img v-if="project.localProfilePicUrl" :src="project.localProfilePicUrl" class="avatar" alt="" />
        <div v-else class="avatar placeholder">📸</div>

        <button class="item-main" type="button" @click="emit('open', project.id)">
          <span class="item-title">@{{ project.username }}<template v-if="project.fullName"> · {{ project.fullName }}</template></span>
          <span class="item-meta">
            {{ compact(project.followers) }} seguidores · {{ project.postsCount }} posts ·
            {{ project.transcribedCount }} transcrito(s){{ project.hasAnalysis ? ' · análise pronta' : '' }}
          </span>
        </button>

        <template v-if="confirmingId === project.id">
          <button class="btn btn-danger small" type="button" @click="confirmRemove(project.id)">Excluir tudo</button>
          <button class="btn btn-ghost small" type="button" @click="confirmingId = null">Voltar</button>
        </template>
        <button v-else class="btn btn-ghost small" type="button" @click="confirmingId = project.id">✕</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.projects {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head h2 {
  font-size: 18px;
  margin: 0 0 4px;
}

.hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
}

.center {
  text-align: center;
}

.warn {
  margin: 0;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.create-form {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.inline {
  margin: 0;
}

.limit {
  width: 70px;
}

.row .btn {
  margin-left: auto;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 10px;
  padding: 4px 8px 4px 8px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}

.placeholder {
  display: grid;
  place-items: center;
  background: var(--border);
}

.item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: none;
  background: none;
  color: var(--text);
  padding: 8px 10px;
}

.item-title {
  font-weight: 600;
  font-size: 13px;
}

.item-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.small {
  font-size: 11px;
  padding: 5px 8px;
}

.btn-danger {
  border: 1px solid var(--danger);
  background: var(--danger);
  color: white;
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}
</style>
