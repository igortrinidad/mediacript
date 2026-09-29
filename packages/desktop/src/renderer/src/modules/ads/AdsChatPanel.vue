<script setup lang="ts">
import { modelOptionLabel } from '../../shared/modelLabel'
import { computed, nextTick, onMounted, ref, watch, type DeepReadonly } from 'vue'
import type { AdChatMessage, AIProviderName, SavedAd } from '@shared/types'
import { useSettings } from '../../composables/useSettings'
import { useClipboard } from '../../composables/useClipboard'
import { renderMarkdown } from '../../shared/markdown'

const props = defineProps<{
  projectId: string
  ads: DeepReadonly<SavedAd[]>
  messages: DeepReadonly<AdChatMessage[]>
}>()

const emit = defineEmits<{
  updated: [messages: AdChatMessage[]]
}>()

const { state: settings } = useSettings()
const { copiedKey, copy } = useClipboard()

const SUGGESTIONS = [
  'Quais padrões os anúncios vencedores têm em comum? Resuma em tópicos.',
  'Crie 3 anúncios novos em vídeo inspirados nos padrões dos achados.',
  'Crie 3 anúncios de imagem (texto na arte, headline e texto principal) usando os hooks que mais aparecem.',
  'Quais oportunidades de ângulo ou nível de consciência os concorrentes NÃO estão explorando?',
  'Escreva 5 variações de hook para testar A/B a partir do melhor anúncio.'
]

const input = ref('')
const sending = ref(false)
const error = ref('')
/** The message being answered, shown right away instead of waiting for the reply to round-trip through disk. */
const pendingMessage = ref('')
const scroller = ref<HTMLElement | null>(null)

const modelChoice = ref('')
const selectedIds = ref<string[]>([])

const modelGroups = computed(() =>
  settings.aiProviders.filter((provider) => provider.hasApiKey).map((provider) => ({
    provider: provider.provider,
    label: provider.label,
    models: provider.models,
    pricing: provider.pricing
  }))
)

const contextCount = computed(() => selectedIds.value.length)

onMounted(() => {
  const gemini = modelGroups.value.find((group) => group.provider === 'gemini')
  const first = gemini ?? modelGroups.value[0]
  if (first) modelChoice.value = `${first.provider}::${first.models[0]}`
  selectDefaultContext()
  scrollToEnd()
})

/** Analyzed ads are the ones with real findings to talk about; fall back to everything when none are analyzed yet. */
function selectDefaultContext(): void {
  const analyzed = props.ads.filter((ad) => ad.analysis)
  selectedIds.value = (analyzed.length ? analyzed : props.ads).map((ad) => ad.id)
}

// Drop selections for ads that were removed from the project.
watch(
  () => props.ads.map((ad) => ad.id).join(','),
  () => {
    const ids = new Set(props.ads.map((ad) => ad.id))
    selectedIds.value = selectedIds.value.filter((id) => ids.has(id))
  }
)

function toggleAd(id: string): void {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((entry) => entry !== id)
    : [...selectedIds.value, id]
}

function scrollToEnd(): void {
  void nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight }))
}

async function send(text = input.value): Promise<void> {
  const message = text.trim()
  if (!message || sending.value || !modelChoice.value) return

  const [provider, ...modelParts] = modelChoice.value.split('::')
  error.value = ''
  sending.value = true
  pendingMessage.value = message
  input.value = ''
  scrollToEnd()

  try {
    emit(
      'updated',
      await window.api.ads.sendChatMessage({
        projectId: props.projectId,
        message,
        provider: provider as AIProviderName,
        model: modelParts.join('::'),
        adIds: [...selectedIds.value]
      })
    )
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível obter a resposta'
    // Give the text back so a transient failure doesn't lose a long prompt.
    input.value = message
  } finally {
    pendingMessage.value = ''
    sending.value = false
    scrollToEnd()
  }
}

async function clearChat(): Promise<void> {
  await window.api.ads.clearChat(props.projectId)
  emit('updated', [])
}
</script>

<template>
  <div class="chat-panel">
    <p v-if="!modelGroups.length" class="warn">Configure ao menos uma chave de IA em Settings › Chaves de API para usar o chat.</p>

    <div class="toolbar">
      <label for="chat-model">Modelo</label>
      <select id="chat-model" v-model="modelChoice">
        <optgroup v-for="group in modelGroups" :key="group.provider" :label="group.label">
          <option v-for="model in group.models" :key="model" :value="`${group.provider}::${model}`">{{ modelOptionLabel(model, group.pricing) }}</option>
        </optgroup>
      </select>
      <button v-if="messages.length" class="btn btn-ghost small clear" type="button" :disabled="sending" @click="clearChat">
        Limpar conversa
      </button>
    </div>

    <details class="context card">
      <summary>
        Contexto: {{ contextCount }} de {{ ads.length }} anúncio(s)
        <span class="hint">— o chat só enxerga os selecionados</span>
      </summary>
      <div class="context-actions">
        <button class="btn btn-ghost small" type="button" @click="selectDefaultContext">Só analisados</button>
        <button class="btn btn-ghost small" type="button" @click="selectedIds = ads.map((ad) => ad.id)">Todos</button>
        <button class="btn btn-ghost small" type="button" @click="selectedIds = []">Nenhum (usa os analisados)</button>
      </div>
      <label v-for="(ad, index) in ads" :key="ad.id" class="context-item">
        <input type="checkbox" :checked="selectedIds.includes(ad.id)" @change="toggleAd(ad.id)" />
        <span>Anúncio {{ index + 1 }} — {{ ad.pageName }}</span>
        <span class="hint">{{ ad.analysis ? 'analisado' : 'sem análise' }}</span>
      </label>
    </details>

    <div ref="scroller" class="messages">
      <div v-if="!messages.length && !pendingMessage" class="empty">
        <p class="hint">
          Converse sobre os achados ou peça novos anúncios. Diga qual é o seu produto e oferta para os criativos saírem
          sob medida.
        </p>
        <div class="suggestions">
          <button
            v-for="suggestion in SUGGESTIONS"
            :key="suggestion"
            class="suggestion"
            type="button"
            :disabled="sending || !modelChoice"
            @click="send(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
      </div>

      <div v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
        <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes the model output before adding its own tags -->
        <div v-if="message.role === 'assistant'" class="markdown" v-html="renderMarkdown(message.content)" />
        <p v-else class="user-text">{{ message.content }}</p>
        <button
          v-if="message.role === 'assistant'"
          class="btn btn-ghost small copy"
          type="button"
          @click="copy(String(index), message.content)"
        >
          {{ copiedKey === String(index) ? 'Copiado!' : 'Copiar' }}
        </button>
      </div>

      <div v-if="pendingMessage" class="message user"><p class="user-text">{{ pendingMessage }}</p></div>
      <div v-if="sending" class="message assistant typing">Pensando…</div>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <form class="composer" @submit.prevent="send()">
      <textarea
        v-model="input"
        rows="2"
        placeholder="Ex.: meu produto é um curso de inglês para adultos, oferta de 7 dias grátis — crie 3 anúncios em vídeo"
        :disabled="sending"
        @keydown.enter.exact.prevent="send()"
      />
      <button class="btn btn-primary" type="submit" :disabled="sending || !input.trim() || !modelChoice">
        {{ sending ? '…' : 'Enviar' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.chat-panel {
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

.clear {
  margin-left: auto;
}

.small {
  font-size: 11px;
  padding: 5px 9px;
}

.warn {
  margin: 0;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.context {
  padding: 8px 12px;
  font-size: 12px;
}

.context summary {
  cursor: pointer;
  font-weight: 600;
}

.context-actions {
  display: flex;
  gap: 6px;
  margin: 8px 0;
}

.context-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 260px;
  max-height: 52vh;
  overflow-y: auto;
  padding: 2px;
}

.empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.suggestion {
  text-align: left;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
}

.suggestion:hover:not(:disabled) {
  border-color: var(--accent);
}

.message {
  position: relative;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 92%;
  user-select: text;
}

.message.user {
  align-self: flex-end;
  color: var(--accent-contrast);
  background: var(--accent);
}

.message.assistant {
  align-self: flex-start;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
}

.typing {
  color: var(--text-muted);
}

.user-text {
  margin: 0;
  white-space: pre-wrap;
}

.copy {
  margin-top: 6px;
}

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  font-size: 14px;
  margin: 12px 0 6px;
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

.markdown :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 10%, transparent);
}

.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.composer textarea {
  flex: 1;
  resize: vertical;
  min-height: 44px;
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}
</style>
