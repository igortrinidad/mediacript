<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { Config } from '@shared/types'
import { useSettings } from '../../../composables/useSettings'

const emit = defineEmits<{
  back: []
}>()

const { state: settings, load, save } = useSettings()

type ApiKeyField = 'groqApiKey' | 'openaiApiKey' | 'anthropicApiKey' | 'geminiApiKey' | 'openrouterApiKey'

interface KeyFieldMeta {
  key: ApiKeyField
  label: string
  placeholder: string
}

const transcriptionFields: KeyFieldMeta[] = [
  { key: 'groqApiKey', label: 'Groq API Key', placeholder: 'gsk_...' },
  { key: 'openaiApiKey', label: 'OpenAI API Key', placeholder: 'sk-...' }
]

const highlightFields: KeyFieldMeta[] = [
  { key: 'anthropicApiKey', label: 'Anthropic API Key', placeholder: 'sk-ant-...' },
  { key: 'geminiApiKey', label: 'Google Gemini API Key', placeholder: 'AIza...' },
  { key: 'openrouterApiKey', label: 'OpenRouter API Key', placeholder: 'sk-or-...' }
]

const fields = reactive<Record<ApiKeyField, { value: string; configured: boolean; cleared: boolean }>>({
  groqApiKey: { value: '', configured: false, cleared: false },
  openaiApiKey: { value: '', configured: false, cleared: false },
  anthropicApiKey: { value: '', configured: false, cleared: false },
  geminiApiKey: { value: '', configured: false, cleared: false },
  openrouterApiKey: { value: '', configured: false, cleared: false }
})

const saving = ref(false)
const configDir = ref('')

onMounted(async () => {
  await load()
  for (const key of Object.keys(fields) as ApiKeyField[]) {
    fields[key].configured = !!settings.config[key]
  }
  configDir.value = await window.api.config.getConfigDir()
})

function toggleClear(key: ApiKeyField): void {
  fields[key].cleared = !fields[key].cleared
  if (fields[key].cleared) fields[key].value = ''
}

/** Masks a stored key so only its last few characters are shown, e.g. `••••••••wxyz`. */
function maskKey(value: string | undefined): string {
  if (!value) return ''
  return `••••••••${value.slice(-4)}`
}

async function onSave(): Promise<void> {
  saving.value = true
  try {
    const payload: Partial<Config> = {}
    for (const [key, field] of Object.entries(fields) as [ApiKeyField, (typeof fields)[ApiKeyField]][]) {
      if (field.cleared) {
        payload[key] = ''
      } else if (field.value.trim()) {
        payload[key] = field.value.trim()
      }
    }
    await save(payload)
    emit('back')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="api-keys-view">
    <header class="view-header">
      <button class="btn btn-ghost" @click="emit('back')">← Voltar</button>
      <h2>Chaves de API</h2>
    </header>

    <section class="privacy-note">
      <span class="privacy-icon" aria-hidden="true">🔒</span>
      <div>
        <strong>Suas chaves ficam só neste computador.</strong>
        Elas são gravadas no arquivo <code>config.json</code> da sua máquina e enviadas apenas para o provedor
        correspondente (Groq, Deepgram, OpenAI, Anthropic, Google ou OpenRouter) na hora de transcrever ou gerar destaques.
        O Mediacript não tem servidor próprio: nenhuma chave, mídia ou transcrição é enviada para nós ou para terceiros.
        <span v-if="configDir" class="privacy-path">Local do arquivo: <code>{{ configDir }}</code></span>
      </div>
    </section>

    <p class="hint">Campos já configurados mostram os últimos dígitos da chave atual — deixe em branco para mantê-la.</p>

    <div class="field-group">
      <h3>Transcrição</h3>
      <div v-for="field in transcriptionFields" :key="field.key" class="key-field">
        <div class="key-field-header">
          <label :for="field.key">{{ field.label }}</label>
          <span v-if="fields[field.key].cleared" class="badge badge-cleared">será removida</span>
          <span v-else-if="fields[field.key].configured" class="badge badge-ok">✓ configurada</span>
        </div>
        <div class="key-field-row">
          <input
            :id="field.key"
            v-model="fields[field.key].value"
            type="password"
            :disabled="fields[field.key].cleared"
            :placeholder="fields[field.key].configured ? maskKey(settings.config[field.key]) : field.placeholder"
          />
          <button v-if="fields[field.key].configured" class="btn btn-ghost" type="button" @click="toggleClear(field.key)">
            {{ fields[field.key].cleared ? 'Desfazer' : 'Remover' }}
          </button>
        </div>
      </div>
      <p class="hint">Basta uma. Com mais de uma configurada, elas viram fallback nesta ordem.</p>
    </div>

    <div class="field-group">
      <h3>IA de destaques (highlights)</h3>
      <div v-for="field in highlightFields" :key="field.key" class="key-field">
        <div class="key-field-header">
          <label :for="field.key">{{ field.label }}</label>
          <span v-if="fields[field.key].cleared" class="badge badge-cleared">será removida</span>
          <span v-else-if="fields[field.key].configured" class="badge badge-ok">✓ configurada</span>
        </div>
        <div class="key-field-row">
          <input
            :id="field.key"
            v-model="fields[field.key].value"
            type="password"
            :disabled="fields[field.key].cleared"
            :placeholder="fields[field.key].configured ? maskKey(settings.config[field.key]) : field.placeholder"
          />
          <button v-if="fields[field.key].configured" class="btn btn-ghost" type="button" @click="toggleClear(field.key)">
            {{ fields[field.key].cleared ? 'Desfazer' : 'Remover' }}
          </button>
        </div>
      </div>
      <p class="hint">Groq e OpenAI acima também podem ser usados para escolher os destaques.</p>
    </div>

    <button class="btn btn-primary" :disabled="saving" @click="onSave">Salvar</button>
  </div>
</template>

<style scoped>
.api-keys-view {
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.view-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.view-header h2 {
  font-size: 16px;
  margin: 0;
}

.field-group h3 {
  font-size: 13px;
  margin: 0 0 10px;
}

.key-field + .key-field {
  margin-top: 14px;
}

.key-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.key-field-header label {
  margin-bottom: 0;
}

.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.badge-ok {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 15%, transparent);
}

.badge-cleared {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 15%, transparent);
}

.key-field-row {
  display: flex;
  gap: 8px;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 10px;
}

.privacy-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
  border: 1px solid color-mix(in srgb, var(--success) 35%, transparent);
  background: color-mix(in srgb, var(--success) 10%, transparent);
}

.privacy-note strong {
  color: var(--text);
}

.privacy-icon {
  font-size: 14px;
  line-height: 1.5;
}

.privacy-path {
  display: block;
  margin-top: 6px;
  word-break: break-all;
}

.privacy-note code {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text) 10%, transparent);
}
</style>
