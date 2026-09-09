<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ScreencastQualityPreset } from '@shared/types'
import { useStepFlow } from '../../composables/useStepFlow'
import { useScreenRecorder, type StartRecordingOptions } from './composables/useScreenRecorder'
import ScreencastSetupStep from './steps/ScreencastSetupStep.vue'
import ScreencastProcessingStep from './steps/ScreencastProcessingStep.vue'

const recorder = useScreenRecorder()

const stepOrder = computed(() => ['setup', 'recording', 'processing'])
const flow = useStepFlow(stepOrder)

const rawFilePath = ref<string | null>(null)
const recordedSeconds = ref(0)
const stopError = ref('')
const confirmingCancel = ref(false)
const processingRunning = ref(true)
// Captured at start rather than read back from the recorder, since the
// processing step still needs them after the streams have been torn down.
const qualityPreset = ref<ScreencastQualityPreset>('whatsapp')
const hasAudio = ref(false)

async function onStart(options: StartRecordingOptions): Promise<void> {
  qualityPreset.value = options.qualityPreset ?? 'whatsapp'
  hasAudio.value = !!options.micDeviceId
  await recorder.startRecording(options)
  flow.goTo('recording')
}

// A stop can be triggered from the floating control window (which drives the
// recorder directly, bypassing this component) or from the in-app button.
// Either way the recorder lands in 'converting' with the saved raw path, so
// advance the flow off the shared state — the processing step then runs the
// optimization pipeline and reports its own progress.
watch(
  () => recorder.state.phase,
  (phase) => {
    if (phase === 'converting' && recorder.state.rawFilePath && !rawFilePath.value) {
      recordedSeconds.value = recorder.state.elapsedSeconds
      rawFilePath.value = recorder.state.rawFilePath
      flow.goTo('processing')
    } else if (phase === 'idle' && flow.currentStep.value !== 'setup') {
      // Recording was cancelled (from the floating control window or here) —
      // it never passed through 'converting', so skip straight back to setup.
      resetFlow()
    }
  }
)

async function stopRecording(): Promise<void> {
  stopError.value = ''
  try {
    await recorder.stop()
  } catch (err: any) {
    stopError.value = err?.message || 'Não foi possível finalizar a gravação'
  }
}

async function cancelRecording(): Promise<void> {
  confirmingCancel.value = false
  await recorder.cancel()
}

function resetFlow(): void {
  recorder.reset()
  rawFilePath.value = null
  recordedSeconds.value = 0
  stopError.value = ''
  confirmingCancel.value = false
  processingRunning.value = true
  flow.reset()
}
</script>

<template>
  <div class="screencast-flow">
    <ScreencastSetupStep v-if="flow.currentStep.value === 'setup'" @continue="onStart" />

    <div v-else-if="flow.currentStep.value === 'recording'" class="recording-notice">
      <p>🔴 Gravando… use o painel flutuante para pausar/parar.</p>
      <p class="hint">Se a janela principal reapareceu, você também pode parar ou cancelar por aqui.</p>

      <template v-if="!confirmingCancel">
        <div class="recording-actions">
          <button class="btn btn-primary" type="button" @click="stopRecording">■ Parar gravação</button>
          <button
            class="btn btn-ghost cancel-btn"
            type="button"
            title="Cancelar gravação"
            @click="confirmingCancel = true"
          >
            ✕ Cancelar
          </button>
        </div>
      </template>
      <template v-else>
        <p class="confirm-text">Cancelar e descartar esta gravação? Essa ação não pode ser desfeita.</p>
        <div class="recording-actions">
          <button class="btn btn-danger" type="button" @click="cancelRecording">Sim, cancelar</button>
          <button class="btn btn-ghost" type="button" @click="confirmingCancel = false">Voltar</button>
        </div>
      </template>

      <p v-if="stopError" class="error-text">{{ stopError }}</p>
    </div>

    <template v-else-if="flow.currentStep.value === 'processing' && rawFilePath">
      <ScreencastProcessingStep
        :raw-file-path="rawFilePath"
        :duration-seconds="recordedSeconds"
        :quality-preset="qualityPreset"
        :has-audio="hasAudio"
        @running-change="processingRunning = $event"
      />
      <button v-if="!processingRunning" class="btn new-run-btn" type="button" @click="resetFlow">
        + Nova gravação
      </button>
    </template>
  </div>
</template>

<style scoped>
.screencast-flow {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.recording-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.hint {
  color: var(--text-muted);
  font-size: 12px;
}

.error-text {
  color: var(--danger);
  font-size: 12px;
}

.recording-actions {
  display: flex;
  gap: 8px;
}

.cancel-btn {
  color: var(--danger);
}

.confirm-text {
  color: var(--danger);
  font-size: 13px;
  max-width: 380px;
}

.btn-danger {
  border: 1px solid var(--danger);
  background: var(--danger);
  color: white;
}

.btn-danger:hover {
  opacity: 0.9;
}

.new-run-btn {
  align-self: center;
}
</style>
