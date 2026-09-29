<script setup lang="ts">
import { nextTick, onMounted, ref, type DeepReadonly } from 'vue'
import type { AdChatMessage, AIProviderName } from '@shared/types'
import { useClipboard } from '../../composables/useClipboard'
import { renderMarkdown } from '../../shared/markdown'

const props = defineProps<{
  projectId: string
  messages: DeepReadonly<AdChatMessage[]>
  /** `provider::model`, chosen in the project header */
  modelChoice: string
}>()

const emit = defineEmits<{
  updated: [messages: AdChatMessage[]]
}>()

const { copiedKey, copy } = useClipboard()

const SUGGESTIONS = [
  'Resuma em tópicos o estilo desse perfil: tom, pilares e estrutura dos posts.',
  'Crie 3 roteiros de reels no estilo desse perfil.',
  'Crie 2 carrosséis (slide a slide, com legenda) usando os pilares que mais engajam.',
  'Escreva 5 variações de gancho de abertura baseadas nos melhores posts.',
  'Monte um calendário de conteúdo de 7 dias para esse perfil.'
]

const input = ref('')
const sending = ref(false)
const error = ref('')
/** Shown right away instead of waiting for the reply to round-trip through disk. */
const pendingMessage = ref('')
const scroller = ref<HTMLElement | null>(null)

onMounted(scrollToEnd)

function scrollToEnd(): void {
  void nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight }))
}

async function send(text = input.value): Promise<void> {
  const message = text.trim()
  if (!message || sending.value || !props.modelChoice) return

  const [provider, ...modelParts] = props.modelChoice.split('::')
  error.value = ''
  sending.value = true
  pendingMessage.value = message
  input.value = ''
  scrollToEnd()

  try {
    emit(
      'updated',
      await window.api.instagram.sendChatMessage({
        projectId: props.projectId,
        message,
        provider: provider as AIProviderName,
        model: modelParts.join('::')
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
  await window.api.instagram.clearChat(props.projectId)
  emit('updated', [])
}
</script>

<template>
  <div class="chat-panel">
    <p v-if="!modelChoice" class="warn">Configure ao menos uma chave de IA em Settings › Chaves de API para usar o chat.</p>

    <div v-if="messages.length" class="toolbar">
      <button class="btn btn-ghost small" type="button" :disabled="sending" @click="clearChat">Limpar conversa</button>
    </div>

    <div ref="scroller" class="messages">
      <div v-if="!messages.length && !pendingMessage" class="empty">
        <p class="hint">
          Peça novos posts no estilo do perfil. Diga seu tema, produto ou objetivo para os roteiros saírem sob medida.
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
        placeholder="Ex.: quero posts sobre produtividade para freelancers, com CTA para o meu e-book"
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
  justify-content: flex-end;
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
