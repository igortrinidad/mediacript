<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const hashQuery = window.location.hash.split('?')[1] || ''
const params = new URLSearchParams(hashQuery)
const micEnabled = params.get('mic') === '1'
const cameraEnabled = params.get('cam') === '1'

const paused = ref(false)
const elapsedSeconds = ref(0)
const confirmingCancel = ref(false)
// Mirrors the setup step's saved choice; the window was already sized for it.
const previewEnabled = ref(params.get('preview') === '1')
const previewFrame = ref('')
let timerHandle: ReturnType<typeof setInterval> | null = null
let unsubscribePreview: (() => void) | null = null

onMounted(() => {
  timerHandle = setInterval(() => {
    if (!paused.value) elapsedSeconds.value++
  }, 1000)

  unsubscribePreview = window.api.screencast.onPreviewFrame((frame) => {
    previewFrame.value = frame
  })
})

onBeforeUnmount(() => {
  if (timerHandle) clearInterval(timerHandle)
  unsubscribePreview?.()
})

const formattedTime = computed(() => {
  const minutes = Math.floor(elapsedSeconds.value / 60)
    .toString()
    .padStart(2, '0')
  const seconds = (elapsedSeconds.value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
})

function togglePause(): void {
  paused.value = !paused.value
  window.api.screencast.sendControlAction(paused.value ? 'pause' : 'resume')
}

/**
 * The main window resizes this one and stops/starts the frame stream — all this
 * side does is ask, and drop the stale frame so reopening never flashes the one
 * from before.
 */
function togglePreview(): void {
  previewEnabled.value = !previewEnabled.value
  if (!previewEnabled.value) previewFrame.value = ''
  window.api.screencast.sendControlAction(previewEnabled.value ? 'preview-on' : 'preview-off')
}

function stop(): void {
  if (timerHandle) clearInterval(timerHandle)
  window.api.screencast.sendControlAction('stop')
}

function requestCancel(): void {
  confirmingCancel.value = true
}

function abortCancelRequest(): void {
  confirmingCancel.value = false
}

function confirmCancel(): void {
  if (timerHandle) clearInterval(timerHandle)
  window.api.screencast.sendControlAction('cancel')
}
</script>

<template>
  <div class="control-shell">
    <div v-if="previewEnabled" class="preview-pane">
      <img v-if="previewFrame" class="preview-image" :class="{ paused }" :src="previewFrame" alt="" />
      <span v-else class="preview-hint">Aguardando o primeiro quadro…</span>
    </div>

    <div class="control-bar">
      <template v-if="!confirmingCancel">
        <span class="rec-dot" :class="{ paused }" />
        <span class="timer">{{ formattedTime }}</span>
        <span
          class="device-icon"
          :class="micEnabled ? 'device-on' : 'device-off'"
          :title="micEnabled ? 'Microfone ativado' : 'Microfone desativado'"
        >
          🎤
        </span>
        <span
          class="device-icon"
          :class="cameraEnabled ? 'device-on' : 'device-off'"
          :title="cameraEnabled ? 'Câmera ativada' : 'Câmera desativada'"
        >
          📷
        </span>
        <button
          class="ctrl-btn preview-btn"
          :class="{ active: previewEnabled }"
          type="button"
          :title="previewEnabled ? 'Ocultar pré-visualização' : 'Mostrar pré-visualização'"
          @click="togglePreview"
        >
          👁
        </button>
        <button class="ctrl-btn" type="button" :title="paused ? 'Retomar' : 'Pausar'" @click="togglePause">
          {{ paused ? '▶' : '⏸' }}
        </button>
        <button class="ctrl-btn stop-btn" type="button" title="Parar" @click="stop">■</button>
        <button class="ctrl-btn cancel-btn" type="button" title="Cancelar gravação" @click="requestCancel">✕</button>
      </template>
      <template v-else>
        <span class="confirm-text">Descartar gravação?</span>
        <button class="ctrl-btn confirm-yes-btn" type="button" title="Sim, cancelar" @click="confirmCancel">✓</button>
        <button class="ctrl-btn" type="button" title="Voltar" @click="abortCancelRequest">✕</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/*
 * The window is exactly as tall as what's showing (the main process resizes it
 * when the preview toggles), so the bar keeps its fixed height and the preview
 * pane takes whatever is left above it.
 */
.control-shell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
}

.preview-pane {
  -webkit-app-region: drag;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  background: #0b0f19;
  border: 1px solid var(--border);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

/* Frames arrive at the capture's aspect ratio, whatever that is — letterbox
   rather than distort what the user is checking. */
.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

/* Paused freezes the last frame server-side; dim it so it doesn't read as live. */
.preview-image.paused {
  opacity: 0.45;
  filter: grayscale(0.6);
}

.preview-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.control-bar {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 70px;
  flex-shrink: 0;
  padding: 0 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
  border: 1px solid var(--border);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--danger);
  animation: pulse 1.4s ease-in-out infinite;
  flex-shrink: 0;
}

.rec-dot.paused {
  animation: none;
  opacity: 0.5;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.timer {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 13px;
  flex: 1;
}

.device-icon {
  -webkit-app-region: no-drag;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 1;
}

.device-icon.device-on {
  background: color-mix(in srgb, var(--success) 22%, transparent);
  box-shadow: 0 0 0 1px var(--success) inset;
}

.device-icon.device-off {
  background: color-mix(in srgb, var(--danger) 22%, transparent);
  box-shadow: 0 0 0 1px var(--danger) inset;
  opacity: 0.55;
  filter: grayscale(1);
}

.ctrl-btn {
  -webkit-app-region: no-drag;
  border: none;
  background: var(--bg);
  color: var(--text);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-btn {
  font-size: 12px;
  opacity: 0.55;
}

.preview-btn.active {
  opacity: 1;
  box-shadow: 0 0 0 1px var(--accent) inset;
}

.stop-btn {
  color: var(--danger);
}

.cancel-btn {
  color: var(--text-muted);
  font-size: 11px;
}

.cancel-btn:hover {
  color: var(--danger);
}

.confirm-text {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--danger);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.confirm-yes-btn {
  background: var(--danger);
  color: white;
}
</style>
