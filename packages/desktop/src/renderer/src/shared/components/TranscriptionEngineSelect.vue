<script setup lang="ts">
import { computed } from 'vue'
import type { TranscriptionEngine } from '@shared/types'
import { useSettings } from '../../composables/useSettings'

const engine = defineModel<TranscriptionEngine>({ required: true })

const { state: settings } = useSettings()

interface EngineOption {
  id: TranscriptionEngine
  label: string
  /** Config key the engine needs; absent = none required to try it. */
  requires?: 'groqApiKey' | 'openaiApiKey' | 'geminiApiKey'
}

const OPTIONS: EngineOption[] = [
  { id: 'auto', label: 'Automático (direto, mais barato)' },
  { id: 'groq', label: 'Groq Whisper — vídeo direto', requires: 'groqApiKey' },
  { id: 'openai', label: 'OpenAI — vídeo direto', requires: 'openaiApiKey' },
  { id: 'gemini', label: 'Gemini — vídeo direto (fala + texto na tela)', requires: 'geminiApiKey' },
  { id: 'local', label: 'Local — ffmpeg + Whisper' }
]

const options = computed(() =>
  OPTIONS.map((option) => ({
    ...option,
    text: option.requires && !settings.config[option.requires] ? `${option.label} (sem API key)` : option.label
  }))
)
</script>

<template>
  <label class="engine-select">
    <span>Transcrição</span>
    <select v-model="engine">
      <option v-for="option in options" :key="option.id" :value="option.id">{{ option.text }}</option>
    </select>
  </label>
</template>

<style scoped>
.engine-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
