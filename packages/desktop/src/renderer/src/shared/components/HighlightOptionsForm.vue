<script setup lang="ts">
import { modelOptionLabel } from '../modelLabel'
import { computed } from 'vue'
import { useSettings } from '../../composables/useSettings'
import { CUSTOM_MODEL } from '../constants'
import type { AIProviderName } from '@shared/types'

export interface HighlightOptionsFormModel {
  provider: AIProviderName
  modelChoice: string
  customModel: string
  prompt: string
  marginSeconds: number
}

defineProps<{
  /** `'full'` shows the prompt + margin fields (one-shot highlight extraction); `'chat'` only asks for provider/model (the prompt comes from the conversation itself). */
  mode: 'full' | 'chat'
}>()

const model = defineModel<HighlightOptionsFormModel>({ required: true })

const { state: settings } = useSettings()

const selectedProvider = computed(() => settings.aiProviders.find((p) => p.provider === model.value.provider))
</script>

<template>
  <div class="field-group">
    <h3>{{ mode === 'full' ? 'Cortes com IA' : 'Conversar com IA' }}</h3>

    <label for="hl-provider">Provedor de IA</label>
    <select id="hl-provider" v-model="model.provider">
      <option v-for="p in settings.aiProviders" :key="p.provider" :value="p.provider">
        {{ p.label }}{{ p.hasApiKey ? '' : ' (sem API key configurada)' }}
      </option>
    </select>

    <label for="hl-model">Modelo</label>
    <select id="hl-model" v-model="model.modelChoice">
      <option v-for="m in selectedProvider?.models ?? []" :key="m" :value="m">{{ modelOptionLabel(m, selectedProvider?.pricing) }}</option>
      <option :value="CUSTOM_MODEL">✏️ Outro (digitar manualmente)</option>
    </select>
    <input v-if="model.modelChoice === CUSTOM_MODEL" v-model="model.customModel" type="text" placeholder="id do modelo" />

    <template v-if="mode === 'full'">
      <label for="hl-prompt">O que a IA deve procurar?</label>
      <textarea
        id="hl-prompt"
        v-model="model.prompt"
        rows="3"
        placeholder='Ex: "os 3 melhores momentos de humor"'
      />

      <label for="hl-margin">Margem antes/depois de cada corte (segundos)</label>
      <input id="hl-margin" v-model.number="model.marginSeconds" type="number" min="0" step="1" />
    </template>

    <p v-if="!selectedProvider?.hasApiKey" class="hint hint-warning">
      Esse provedor ainda não tem API key configurada. Configure em Settings antes de continuar.
    </p>
  </div>
</template>

<style scoped>
.field-group > * + * {
  margin-top: 10px;
}

.field-group h3 {
  font-size: 13px;
  margin: 0 0 10px;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
}

.hint-warning {
  color: var(--warning);
}
</style>
