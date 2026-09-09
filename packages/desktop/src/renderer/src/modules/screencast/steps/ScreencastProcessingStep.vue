<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  ScreencastLogLine,
  ScreencastProcessResult,
  ScreencastProgressEvent,
  ScreencastQualityPreset
} from '@shared/types'

const props = defineProps<{
  rawFilePath: string
  durationSeconds: number
  qualityPreset: ScreencastQualityPreset
  hasAudio: boolean
}>()

const emit = defineEmits<{
  /** Lets the flow hide its "new recording" button while a run (or a retry) is in flight. */
  runningChange: [running: boolean]
}>()

interface StepState {
  name: string
  status: ScreencastProgressEvent['status']
  detail?: string
}

// The optimize step is chatty (one ffmpeg progress line every few hundred ms) —
// only the tail is useful, and capping it keeps a long recording from growing
// this array without bound.
const MAX_LOG_LINES = 300

const steps = ref<StepState[]>([])
const logs = ref<ScreencastLogLine[]>([])
const result = ref<ScreencastProcessResult | null>(null)
const error = ref('')
const running = ref(false)
const logBox = ref<HTMLElement | null>(null)

let unsubscribeProgress: (() => void) | null = null
let unsubscribeLog: (() => void) | null = null

function trackProgress(event: ScreencastProgressEvent): void {
  const existing = steps.value.find((step) => step.name === event.step)
  if (existing) {
    existing.status = event.status
    existing.detail = event.detail ?? existing.detail
  } else {
    steps.value.push({ name: event.step, status: event.status, detail: event.detail })
  }
}

watch(
  () => logs.value.length,
  async () => {
    await nextTick()
    if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight
  }
)

async function run(): Promise<void> {
  running.value = true
  emit('runningChange', true)
  error.value = ''
  result.value = null
  steps.value = []
  logs.value = []
  try {
    result.value = await window.api.screencast.process({
      rawFilePath: props.rawFilePath,
      durationSeconds: props.durationSeconds,
      qualityPreset: props.qualityPreset,
      hasAudio: props.hasAudio
    })
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível otimizar a gravação'
  } finally {
    running.value = false
    emit('runningChange', false)
  }
}

onMounted(() => {
  unsubscribeProgress = window.api.screencast.onProgress(trackProgress)
  unsubscribeLog = window.api.screencast.onLog((line) => {
    logs.value.push(line)
    if (logs.value.length > MAX_LOG_LINES) logs.value.splice(0, logs.value.length - MAX_LOG_LINES)
  })
  void run()
})

onBeforeUnmount(() => {
  unsubscribeProgress?.()
  unsubscribeLog?.()
})

function statusIcon(status: ScreencastProgressEvent['status']): string {
  if (status === 'completed') return '✅'
  if (status === 'failed') return '❌'
  return '⏳'
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function openOutput(): Promise<void> {
  if (result.value) await window.api.files.openFile(result.value.outputPath)
}

function revealOutput(): void {
  if (result.value) window.api.files.revealInFolder(result.value.outputPath)
}
</script>

<template>
  <div class="screencast-processing">
    <h3 v-if="running">Processando a gravação…</h3>
    <h3 v-else-if="error" class="title-danger">⚠️ Falha ao otimizar</h3>
    <h3 v-else-if="result" class="title-success">✅ Gravação pronta</h3>

    <p v-if="running" class="hint">
      Convertendo a captura bruta para MP4 H.264 em 1080p — isso pode levar alguns instantes.
    </p>

    <ul v-if="steps.length" class="step-list">
      <li v-for="step in steps" :key="step.name" :class="step.status">
        <span class="step-icon">{{ statusIcon(step.status) }}</span>
        <span class="step-name">{{ step.name }}</span>
        <span v-if="step.detail" class="step-detail">{{ step.detail }}</span>
      </li>
    </ul>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div v-if="logs.length" ref="logBox" class="log-box">
      <div v-for="(line, index) in logs" :key="index" class="log-line" :class="line.level">{{ line.text }}</div>
    </div>

    <template v-if="result">
      <p>
        Vídeo otimizado (1080p): <strong>{{ formatMB(result.sizeBytes) }}</strong>
        <span class="hint"> — a captura bruta tinha {{ formatMB(result.rawSizeBytes) }}</span>
      </p>
      <p class="result-path" :title="result.outputPath">{{ result.outputPath }}</p>
      <div class="result-actions">
        <button class="btn btn-ghost" type="button" @click="openOutput">Abrir</button>
        <button class="btn btn-ghost" type="button" @click="revealOutput">Mostrar na pasta</button>
      </div>
    </template>

    <template v-else-if="error">
      <p class="result-path">A captura bruta foi preservada em: {{ rawFilePath }}</p>
      <button class="btn btn-primary" type="button" @click="run">Tentar novamente</button>
    </template>
  </div>
</template>

<style scoped>
.screencast-processing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

h3 {
  margin: 0;
}

.title-success {
  color: var(--success);
}

.title-danger {
  color: var(--warning);
}

.hint {
  color: var(--text-muted);
  font-size: 12px;
  margin: 0;
}

.step-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  font-size: 13px;
}

.step-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 8px 10px;
}

.step-list li.failed {
  border-color: var(--danger);
}

.step-icon {
  flex-shrink: 0;
}

.step-name {
  flex: 1;
}

.step-detail {
  font-size: 11px;
  color: var(--text-muted);
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
  user-select: text;
}

.log-box {
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: left;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
  user-select: text;
}

.log-line {
  white-space: pre-wrap;
  word-break: break-word;
}

.log-line.warn {
  color: var(--warning);
}

.log-line.error {
  color: var(--danger);
}

.log-line.progress {
  opacity: 0.75;
  font-style: italic;
}

.result-path {
  color: var(--text-muted);
  font-size: 11px;
  word-break: break-all;
  user-select: text;
}

.result-actions {
  display: flex;
  gap: 8px;
}
</style>
