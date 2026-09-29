<script setup lang="ts">
import { modelOptionLabel } from '../../shared/modelLabel'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { IgPost, IgProjectDetail } from '@shared/types'
import { useSettings } from '../../composables/useSettings'
import { useClipboard } from '../../composables/useClipboard'
import { renderMarkdown } from '../../shared/markdown'
import IgChatPanel from './IgChatPanel.vue'
import IgPostCard from './IgPostCard.vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{
  back: []
}>()

const { state: settings, load: loadSettings } = useSettings()
const { copiedKey, copy } = useClipboard()

const project = ref<IgProjectDetail | null>(null)
const tab = ref<'posts' | 'analysis' | 'chat'>('posts')
const error = ref('')
const modelChoice = ref('')
/** postId → latest progress step, for posts being transcribed right now */
const progress = reactive<Record<string, string>>({})
const transcribing = ref(false)
const analyzing = ref(false)
const refreshing = ref(false)
const notice = ref('')

const modelGroups = computed(() =>
  settings.aiProviders.filter((provider) => provider.hasApiKey).map((provider) => ({
    provider: provider.provider,
    label: provider.label,
    models: provider.models,
    pricing: provider.pricing
  }))
)

const hasTranscriptionKey = computed(() => !!settings.config.groqApiKey || !!settings.config.openaiApiKey)
const isVideo = (post: { type: IgPost['type'] }): boolean => post.type === 'reel' || post.type === 'video'
const pendingVideos = computed(() => project.value?.posts.filter((post) => isVideo(post) && !post.transcript) ?? [])

let unsubscribeProgress: (() => void) | null = null

onMounted(async () => {
  await loadSettings()
  const gemini = modelGroups.value.find((group) => group.provider === 'gemini')
  const first = gemini ?? modelGroups.value[0]
  if (first) modelChoice.value = `${first.provider}::${first.models[0]}`

  unsubscribeProgress = window.api.instagram.onProgress((event) => {
    if (event.projectId !== props.projectId || !event.postId) return
    if (event.status === 'running') progress[event.postId] = event.step
    else if (event.status === 'failed') delete progress[event.postId]
  })
  await reload()
})

onBeforeUnmount(() => unsubscribeProgress?.())

async function reload(): Promise<void> {
  try {
    project.value = await window.api.instagram.getProject(props.projectId)
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível abrir o projeto'
  }
}

async function transcribe(postIds?: string[]): Promise<void> {
  error.value = ''
  notice.value = ''
  transcribing.value = true
  for (const id of postIds ?? pendingVideos.value.map((post) => post.id)) progress[id] = 'Na fila…'

  try {
    const result = await window.api.instagram.transcribe({ projectId: props.projectId, postIds })
    if (result.failed) {
      notice.value = `${result.transcribed} transcrito(s), ${result.failed} com falha. Links expirados? Use “Atualizar perfil” e tente de novo.`
    }
  } catch (err: any) {
    error.value = err?.message || 'Falha ao transcrever'
  } finally {
    for (const key of Object.keys(progress)) delete progress[key]
    transcribing.value = false
    await reload()
  }
}

async function analyze(): Promise<void> {
  if (!modelChoice.value) return
  const [provider, ...modelParts] = modelChoice.value.split('::')
  error.value = ''
  analyzing.value = true
  try {
    await window.api.instagram.analyze({
      projectId: props.projectId,
      provider: provider as any,
      model: modelParts.join('::')
    })
    await reload()
    tab.value = 'analysis'
  } catch (err: any) {
    error.value = err?.message || 'Falha ao analisar o perfil'
  } finally {
    analyzing.value = false
  }
}

async function refresh(): Promise<void> {
  error.value = ''
  refreshing.value = true
  try {
    project.value = await window.api.instagram.refreshProject(props.projectId, project.value?.posts.length || 16)
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível atualizar o perfil'
  } finally {
    refreshing.value = false
  }
}

function compact(value?: number): string {
  return value === undefined ? '—' : new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value)
}
</script>

<template>
  <div class="project">
    <header class="head">
      <button class="btn btn-ghost back" type="button" @click="emit('back')">← Perfis</button>
    </header>

    <section v-if="project" class="card profile">
      <img v-if="project.profile.localProfilePicUrl" :src="project.profile.localProfilePicUrl" class="avatar" alt="" />
      <div v-else class="avatar placeholder">📸</div>

      <div class="profile-info">
        <h2>
          @{{ project.profile.username }}
          <span v-if="project.profile.verified" title="Verificado">✔️</span>
        </h2>
        <p v-if="project.profile.fullName" class="name">{{ project.profile.fullName }}</p>
        <p v-if="project.profile.category" class="hint">{{ project.profile.category }}</p>
        <p v-if="project.profile.biography" class="bio">{{ project.profile.biography }}</p>
        <a v-if="project.profile.externalUrl" class="link" :href="project.profile.externalUrl" target="_blank" rel="noreferrer">
          {{ project.profile.externalUrl }}
        </a>
        <p v-if="project.description" class="hint">🎯 {{ project.description }}</p>
      </div>

      <div class="stats">
        <div><b>{{ compact(project.profile.followers) }}</b><span>seguidores</span></div>
        <div><b>{{ compact(project.profile.following) }}</b><span>seguindo</span></div>
        <div><b>{{ compact(project.profile.postsCount) }}</b><span>posts</span></div>
      </div>
    </section>
    <h2 v-else class="loading">Carregando…</h2>

    <p v-if="error" class="error-text">{{ error }}</p>
    <p v-if="notice" class="warn">{{ notice }}</p>
    <p v-if="!hasTranscriptionKey && pendingVideos.length" class="warn">
      Configure a chave do Groq ou da OpenAI em Settings › Chaves de API para transcrever reels e vídeos.
    </p>

    <div class="toolbar">
      <label for="ig-model">Modelo</label>
      <select id="ig-model" v-model="modelChoice">
        <optgroup v-for="group in modelGroups" :key="group.provider" :label="group.label">
          <option v-for="model in group.models" :key="model" :value="`${group.provider}::${model}`">{{ modelOptionLabel(model, group.pricing) }}</option>
        </optgroup>
      </select>
      <button class="btn btn-ghost small" type="button" :disabled="refreshing || transcribing" @click="refresh">
        {{ refreshing ? 'Atualizando… (1–3 min)' : '↻ Atualizar perfil' }}
      </button>
    </div>

    <nav class="tabs">
      <button class="tab" :class="{ active: tab === 'posts' }" type="button" @click="tab = 'posts'">
        Posts ({{ project?.posts.length ?? 0 }})
      </button>
      <button class="tab" :class="{ active: tab === 'analysis' }" type="button" @click="tab = 'analysis'">📊 Análise</button>
      <button class="tab" :class="{ active: tab === 'chat' }" type="button" @click="tab = 'chat'">💬 Criar posts</button>
    </nav>

    <div v-show="tab === 'posts'" class="posts">
      <div v-if="project?.posts.length" class="posts-bar">
        <span class="hint">{{ project.transcribedCount }} de {{ project.posts.filter(isVideo).length }} vídeo(s) transcrito(s)</span>
        <button
          class="btn btn-primary small"
          type="button"
          :disabled="transcribing || !pendingVideos.length || !hasTranscriptionKey"
          @click="transcribe()"
        >
          {{ transcribing ? 'Transcrevendo…' : `Transcrever pendentes (${pendingVideos.length})` }}
        </button>
      </div>

      <p v-if="project && !project.posts.length" class="hint">Nenhum post coletado para este perfil.</p>

      <IgPostCard
        v-for="(post, index) in project?.posts ?? []"
        :key="post.id"
        :post="post"
        :index="index"
        :followers="project?.profile.followers"
        :busy="transcribing || !hasTranscriptionKey"
        :progress-text="progress[post.id]"
        @transcribe="transcribe([post.id])"
      />
    </div>

    <div v-show="tab === 'analysis'" class="analysis">
      <div class="analysis-bar">
        <p class="hint">
          Diagnóstico do perfil a partir da bio, das legendas, das métricas e das transcrições.
          <template v-if="project && pendingVideos.length"> Transcreva os reels antes para uma análise mais rica.</template>
        </p>
        <button class="btn btn-primary" type="button" :disabled="analyzing || !modelChoice || !project?.posts.length" @click="analyze">
          {{ analyzing ? 'Analisando…' : project?.analysis ? 'Analisar de novo' : 'Analisar perfil' }}
        </button>
      </div>

      <section v-if="project?.analysis" class="card report">
        <p class="hint">
          Gerado em {{ new Date(project.analysis.createdAt).toLocaleString('pt-BR') }} com {{ project.analysis.model }}
          <button class="btn btn-ghost small" type="button" @click="copy('report', project.analysis.report)">
            {{ copiedKey === 'report' ? 'Copiado!' : 'Copiar' }}
          </button>
        </p>
        <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes the model output before adding its own tags -->
        <div class="markdown" v-html="renderMarkdown(project.analysis.report)" />
      </section>
    </div>

    <IgChatPanel
      v-if="project"
      v-show="tab === 'chat'"
      :project-id="project.id"
      :messages="project.chat"
      :model-choice="modelChoice"
      @updated="project.chat = $event"
    />
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
}

.back {
  font-size: 12px;
  padding: 5px 9px;
}

.loading {
  font-size: 15px;
  margin: 0;
}

.profile {
  display: flex;
  gap: 16px;
  padding: 14px;
  align-items: flex-start;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}

.placeholder {
  display: grid;
  place-items: center;
  background: var(--border);
  font-size: 26px;
}

.profile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.profile-info h2 {
  font-size: 17px;
  margin: 0;
}

.name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.bio {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  user-select: text;
}

.link {
  font-size: 12px;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats {
  display: flex;
  gap: 16px;
  flex: none;
}

.stats div {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 11px;
  color: var(--text-muted);
}

.stats b {
  font-size: 15px;
  color: var(--text);
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.warn {
  margin: 0;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
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

.toolbar .btn {
  margin-left: auto;
}

.small {
  font-size: 11px;
  padding: 5px 9px;
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

.posts,
.analysis {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.posts-bar,
.analysis-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.report {
  padding: 14px 18px;
  font-size: 13px;
  line-height: 1.55;
  user-select: text;
}

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  font-size: 14px;
  margin: 16px 0 6px;
}

.markdown :deep(h2:first-child) {
  margin-top: 0;
}

.markdown :deep(p) {
  margin: 0 0 8px;
}

.markdown :deep(ul) {
  margin: 0 0 8px;
  padding-left: 20px;
}

.markdown :deep(table) {
  border-collapse: collapse;
  font-size: 12px;
  margin: 6px 0;
}

.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 4px 8px;
  text-align: left;
}
</style>
