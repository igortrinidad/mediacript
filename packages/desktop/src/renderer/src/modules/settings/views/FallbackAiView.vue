<script setup lang="ts">
import { modelOptionLabel } from '../../../shared/modelLabel'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { AIProviderName, HighlightFallbackModel } from '@shared/types'
import { useSettings } from '../../../composables/useSettings'
import { CUSTOM_MODEL } from '../../../shared/constants'

const emit = defineEmits<{
  back: []
}>()

const { state: settings, load, save } = useSettings()

const fallbackModels = ref<HighlightFallbackModel[]>([])
const saving = ref(false)

const newFallback = reactive({
  provider: 'anthropic' as AIProviderName,
  modelChoice: '',
  customModel: ''
})

const newFallbackProvider = computed(() => settings.aiProviders.find((p) => p.provider === newFallback.provider))

watch(
  () => newFallback.provider,
  () => {
    newFallback.modelChoice = ''
    newFallback.customModel = ''
  }
)

function providerLabel(provider: AIProviderName): string {
  return settings.aiProviders.find((p) => p.provider === provider)?.label ?? provider
}

function addFallback(): void {
  const model = newFallback.modelChoice === CUSTOM_MODEL ? newFallback.customModel.trim() : newFallback.modelChoice
  if (!model) return

  fallbackModels.value.push({ provider: newFallback.provider, model })
  newFallback.modelChoice = ''
  newFallback.customModel = ''
}

function removeFallback(index: number): void {
  fallbackModels.value.splice(index, 1)
}

function moveFallback(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= fallbackModels.value.length) return
  const [entry] = fallbackModels.value.splice(index, 1)
  fallbackModels.value.splice(target, 0, entry)
}

onMounted(async () => {
  await load()
  fallbackModels.value = (settings.config.highlightFallbackModels ?? []).map((entry) => ({ ...entry }))
})

async function onSave(): Promise<void> {
  saving.value = true
  try {
    await save({ highlightFallbackModels: fallbackModels.value })
    emit('back')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="fallback-view">
    <header class="view-header">
      <button class="btn btn-ghost" @click="emit('back')">← Voltar</button>
      <h2>IA de destaques (fallback)</h2>
    </header>

    <p class="hint">
      Se o provedor/modelo escolhido no chat/agente falhar (mesmo após novas tentativas automáticas), os modelos
      abaixo são tentados nesta ordem, até um funcionar.
    </p>

    <ul v-if="fallbackModels.length" class="fallback-list">
      <li v-for="(entry, index) in fallbackModels" :key="`${entry.provider}-${entry.model}-${index}`" class="fallback-item">
        <span class="fallback-order">{{ index + 1 }}</span>
        <span class="fallback-label">{{ providerLabel(entry.provider) }} · {{ entry.model }}</span>
        <div class="fallback-actions">
          <button class="btn btn-ghost" type="button" title="Mover para cima" :disabled="index === 0" @click="moveFallback(index, -1)">↑</button>
          <button
            class="btn btn-ghost"
            type="button"
            title="Mover para baixo"
            :disabled="index === fallbackModels.length - 1"
            @click="moveFallback(index, 1)"
          >
            ↓
          </button>
          <button class="btn btn-ghost" type="button" title="Remover" @click="removeFallback(index)">✕</button>
        </div>
      </li>
    </ul>
    <p v-else class="hint">Nenhum fallback configurado.</p>

    <div class="fallback-add-row">
      <select v-model="newFallback.provider">
        <option v-for="p in settings.aiProviders" :key="p.provider" :value="p.provider">{{ p.label }}</option>
      </select>
      <select v-model="newFallback.modelChoice">
        <option value="" disabled>Modelo…</option>
        <option v-for="m in newFallbackProvider?.models ?? []" :key="m" :value="m">{{ modelOptionLabel(m, newFallbackProvider?.pricing) }}</option>
        <option :value="CUSTOM_MODEL">✏️ Outro (digitar manualmente)</option>
      </select>
      <input v-if="newFallback.modelChoice === CUSTOM_MODEL" v-model="newFallback.customModel" type="text" placeholder="id do modelo" />
      <button class="btn" type="button" @click="addFallback">+ Adicionar</button>
    </div>

    <button class="btn btn-primary" :disabled="saving" @click="onSave">Salvar</button>
  </div>
</template>

<style scoped>
.fallback-view {
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
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

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.fallback-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fallback-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--bg);
}

.fallback-order {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  width: 16px;
  text-align: center;
}

.fallback-label {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fallback-actions {
  display: flex;
  gap: 4px;
}

.fallback-add-row {
  display: flex;
  gap: 8px;
}

.fallback-add-row select,
.fallback-add-row input {
  flex: 1;
}
</style>
