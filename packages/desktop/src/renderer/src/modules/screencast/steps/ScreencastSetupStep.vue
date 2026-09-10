<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  CameraBubbleCorner,
  CameraBubbleOptions,
  CameraBubbleShape,
  ScreenSource,
  ScreencastPreferences,
  ScreencastQualityPreset
} from '@shared/types'
import { BORDER_COLOR_PRESETS, DEFAULT_CAMERA_BUBBLE } from '../composables/cameraBubble'
import {
  loadScreencastPreferences,
  resolveDeviceId,
  saveScreencastPreferences,
  toDevicePreference
} from '../composables/useScreencastPreferences'
import {
  useScreenRecorder,
  type RecordingDeviceOption,
  type StartRecordingOptions
} from '../composables/useScreenRecorder'
import CameraBubblePreview from '../components/CameraBubblePreview.vue'

const emit = defineEmits<{
  continue: [options: StartRecordingOptions]
}>()

const recorder = useScreenRecorder()

const sources = ref<ScreenSource[]>([])
const selectedSourceId = ref<string | null>(null)
const cameras = ref<RecordingDeviceOption[]>([])
const mics = ref<RecordingDeviceOption[]>([])
const cameraEnabled = ref(false)
const micEnabled = ref(false)
const selectedCameraId = ref('')
const selectedMicId = ref('')
const loading = ref(true)
const starting = ref(false)
const error = ref('')

const bubbleCorner = ref<CameraBubbleCorner>(DEFAULT_CAMERA_BUBBLE.corner)
const bubbleShape = ref<CameraBubbleShape>(DEFAULT_CAMERA_BUBBLE.shape)
const bubbleSizePercent = ref(Math.round(DEFAULT_CAMERA_BUBBLE.sizeRatio * 100))
const bubbleBorderWidth = ref(DEFAULT_CAMERA_BUBBLE.borderWidth)
const bubbleBorderColor = ref(DEFAULT_CAMERA_BUBBLE.borderColor)

const cornerOptions: { value: CameraBubbleCorner; label: string }[] = [
  { value: 'top-left', label: '↖ Superior esquerdo' },
  { value: 'top-right', label: '↗ Superior direito' },
  { value: 'bottom-left', label: '↙ Inferior esquerdo' },
  { value: 'bottom-right', label: '↘ Inferior direito' }
]

const shapeOptions: { value: CameraBubbleShape; label: string }[] = [
  { value: 'circle', label: '● Bola' },
  { value: 'rounded', label: '▢ Arredondado' },
  { value: 'square', label: '■ Quadrado' }
]

const qualityPreset = ref<ScreencastQualityPreset>('whatsapp')

const qualityOptions: { value: ScreencastQualityPreset; label: string; hint: string }[] = [
  { value: 'whatsapp', label: '📱 WhatsApp', hint: 'Até 45MB · 1080p (cai para 720p em gravações longas)' },
  { value: 'balanced', label: '⚖️ Equilibrado', hint: 'Até 150MB · 1080p · bom para e-mail e Drive' },
  { value: 'high', label: '💎 Alta qualidade', hint: 'Sem limite de tamanho · até 1440p' }
]

const selectedQualityHint = computed(
  () => qualityOptions.find((option) => option.value === qualityPreset.value)?.hint ?? ''
)

const cameraBubble = computed<CameraBubbleOptions>(() => ({
  corner: bubbleCorner.value,
  shape: bubbleShape.value,
  sizeRatio: bubbleSizePercent.value / 100,
  borderWidth: bubbleBorderWidth.value,
  borderColor: bubbleBorderColor.value
}))

const selectedSourceThumbnail = computed(
  () => sources.value.find((source) => source.id === selectedSourceId.value)?.thumbnailDataUrl ?? null
)

/**
 * The whole setup minus the screen/window pick — that one is deliberately not
 * remembered, since window ids change every session and a stale screen choice
 * would silently record the wrong thing.
 */
const preferences = computed<ScreencastPreferences>(() => ({
  cameraEnabled: cameraEnabled.value,
  micEnabled: micEnabled.value,
  camera: toDevicePreference(cameras.value, selectedCameraId.value),
  mic: toDevicePreference(mics.value, selectedMicId.value),
  cameraBubble: cameraBubble.value,
  qualityPreset: qualityPreset.value
}))

/** Coalesces the burst of writes a slider drag would otherwise produce. */
const PREFERENCES_SAVE_DEBOUNCE_MS = 400

let preferencesLoaded = false
let saveHandle: ReturnType<typeof setTimeout> | null = null

function schedulePreferencesSave(): void {
  if (saveHandle) clearTimeout(saveHandle)
  saveHandle = setTimeout(() => {
    saveHandle = null
    void saveScreencastPreferences(preferences.value)
  }, PREFERENCES_SAVE_DEBOUNCE_MS)
}

function flushPreferencesSave(): void {
  if (!saveHandle) return
  clearTimeout(saveHandle)
  saveHandle = null
  void saveScreencastPreferences(preferences.value)
}

// Persist as the user tweaks rather than only on start, so a setup they
// configured but didn't record with still comes back next time.
watch(preferences, () => {
  if (preferencesLoaded) schedulePreferencesSave()
})

// This step unmounts the moment recording starts — flush anything still
// waiting out the debounce instead of dropping it.
onBeforeUnmount(flushPreferencesSave)

// `<input type="color">` always reports lowercase hex, but a preset could be
// typed in any case — compare normalized so the swatch highlights correctly.
function isSelectedColor(color: string): boolean {
  return bubbleBorderColor.value.toLowerCase() === color.toLowerCase()
}

async function loadSources(): Promise<void> {
  sources.value = await recorder.listScreenSources()
  if (!selectedSourceId.value && sources.value.length) {
    selectedSourceId.value = sources.value[0].id
  }
}

onMounted(async () => {
  try {
    await loadSources()
    const [devices, saved] = await Promise.all([recorder.listMediaDevices(), loadScreencastPreferences()])
    cameras.value = devices.cameras
    mics.value = devices.mics

    cameraEnabled.value = saved.cameraEnabled
    micEnabled.value = saved.micEnabled
    selectedCameraId.value = resolveDeviceId(devices.cameras, saved.camera)
    selectedMicId.value = resolveDeviceId(devices.mics, saved.mic)
    bubbleCorner.value = saved.cameraBubble.corner
    bubbleShape.value = saved.cameraBubble.shape
    bubbleSizePercent.value = Math.round(saved.cameraBubble.sizeRatio * 100)
    bubbleBorderWidth.value = saved.cameraBubble.borderWidth
    bubbleBorderColor.value = saved.cameraBubble.borderColor
    qualityPreset.value = saved.qualityPreset

    // Arm the auto-save only once the stored values are in place — otherwise a
    // failed load would let the next tweak overwrite them with the defaults.
    preferencesLoaded = true
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível listar telas/dispositivos'
  } finally {
    loading.value = false
  }
})

async function start(): Promise<void> {
  if (!selectedSourceId.value) return
  starting.value = true
  error.value = ''
  try {
    emit('continue', {
      sourceId: selectedSourceId.value,
      cameraDeviceId: cameraEnabled.value ? selectedCameraId.value || undefined : undefined,
      micDeviceId: micEnabled.value ? selectedMicId.value || undefined : undefined,
      cameraBubble: cameraEnabled.value ? { ...cameraBubble.value } : undefined,
      qualityPreset: qualityPreset.value
    })
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível iniciar a gravação'
    starting.value = false
  }
}
</script>

<template>
  <div class="screencast-setup">
    <p class="step-intro">Grave a tela ou uma janela, com câmera e microfone opcionais.</p>

    <div v-if="loading" class="hint">Carregando telas e dispositivos…</div>

    <template v-else>
      <div class="section source-section">
        <div class="section-header">
          <span class="section-title">Tela ou janela</span>
          <button class="btn btn-ghost btn-refresh" type="button" @click="loadSources">↻ Atualizar</button>
        </div>
        <div class="source-grid">
          <button
            v-for="source in sources"
            :key="source.id"
            type="button"
            class="source-card"
            :class="{ active: selectedSourceId === source.id }"
            @click="selectedSourceId = source.id"
          >
            <img :src="source.thumbnailDataUrl" :alt="source.name" class="source-thumb" />
            <span class="source-name" :title="source.name">{{ source.name }}</span>
          </button>
        </div>
      </div>

      <div class="section toggle-row">
        <label class="toggle-label">
          <input v-model="cameraEnabled" type="checkbox" />
          Gravar câmera
        </label>
        <select v-if="cameraEnabled" v-model="selectedCameraId" class="device-select">
          <option v-for="cam in cameras" :key="cam.deviceId" :value="cam.deviceId">{{ cam.label }}</option>
        </select>
      </div>

      <div v-if="cameraEnabled" class="section bubble-section">
        <span class="section-title">Aparência da câmera</span>

        <CameraBubblePreview
          :source-thumbnail="selectedSourceThumbnail"
          :camera-device-id="selectedCameraId"
          :bubble="cameraBubble"
          :active="cameraEnabled && !starting"
        />

        <div class="bubble-row">
          <span class="bubble-label">Posição</span>
          <div class="corner-grid">
            <button
              v-for="opt in cornerOptions"
              :key="opt.value"
              type="button"
              class="chip"
              :class="{ active: bubbleCorner === opt.value }"
              @click="bubbleCorner = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="bubble-row">
          <span class="bubble-label">Formato</span>
          <div class="chip-row">
            <button
              v-for="opt in shapeOptions"
              :key="opt.value"
              type="button"
              class="chip"
              :class="{ active: bubbleShape === opt.value }"
              @click="bubbleShape = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="bubble-row">
          <span class="bubble-label">Tamanho ({{ bubbleSizePercent }}%)</span>
          <input v-model.number="bubbleSizePercent" type="range" min="8" max="35" step="1" class="bubble-slider" />
        </div>

        <div class="bubble-row">
          <span class="bubble-label">Borda</span>
          <div class="border-controls">
            <input
              v-model.number="bubbleBorderWidth"
              type="range"
              min="0"
              max="10"
              step="1"
              class="bubble-slider"
            />
            <span class="border-width-value">{{ bubbleBorderWidth }}px</span>
          </div>

          <div class="swatch-grid" :class="{ 'swatch-grid-disabled': bubbleBorderWidth === 0 }">
            <button
              v-for="preset in BORDER_COLOR_PRESETS"
              :key="preset.value"
              type="button"
              class="swatch"
              :class="{ active: isSelectedColor(preset.value) }"
              :style="{ background: preset.value }"
              :title="preset.label"
              :aria-label="preset.label"
              :disabled="bubbleBorderWidth === 0"
              @click="bubbleBorderColor = preset.value"
            />
            <label class="swatch swatch-custom" title="Cor personalizada">
              <input v-model="bubbleBorderColor" type="color" :disabled="bubbleBorderWidth === 0" />
            </label>
          </div>
        </div>
      </div>

      <div class="section toggle-row">
        <label class="toggle-label">
          <input v-model="micEnabled" type="checkbox" />
          Gravar microfone
        </label>
        <select v-if="micEnabled" v-model="selectedMicId" class="device-select">
          <option v-for="mic in mics" :key="mic.deviceId" :value="mic.deviceId">{{ mic.label }}</option>
        </select>
      </div>

      <div class="section quality-section">
        <span class="section-title">Qualidade do arquivo final</span>
        <div class="chip-row">
          <button
            v-for="option in qualityOptions"
            :key="option.value"
            type="button"
            class="chip"
            :class="{ active: qualityPreset === option.value }"
            @click="qualityPreset = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="quality-hint">{{ selectedQualityHint }}</p>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>

      <button class="btn btn-primary start-btn" type="button" :disabled="!selectedSourceId || starting" @click="start">
        {{ starting ? 'Iniciando…' : '● Iniciar gravação' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
/*
 * The source picker wants the whole window so its thumbnails stay readable at
 * four across; every other control reads better in a narrow column, so those
 * are centered at the old 640px instead of stretching with it.
 */
.screencast-setup {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section:not(.source-section),
.step-intro,
.error-text,
.hint {
  width: 100%;
  max-width: 640px;
  align-self: center;
}

.step-intro {
  color: var(--text-muted);
  font-size: 13px;
  margin: 0;
  text-align: center;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-weight: 600;
  font-size: 13px;
}

.btn-refresh {
  font-size: 11px;
  padding: 4px 8px;
}

/* One column by default, then sm/md/lg/xl steps up to four across. */
.source-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 768px) {
  .source-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .source-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .source-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.source-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Window titles are long and unbreakable — without this the button's
     intrinsic width wins and the label runs past the card. */
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 10px;
  padding: 6px;
  text-align: left;
}

.source-card.active {
  border-color: var(--accent);
}

.source-thumb {
  width: 100%;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  border-radius: 6px;
  background: var(--bg);
}

.source-name {
  display: block;
  max-width: 100%;
  min-width: 0;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toggle-row {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.device-select {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
}

.bubble-section {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 10px;
  padding: 12px;
  gap: 12px;
}

.bubble-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bubble-label {
  font-size: 12px;
  color: var(--text-muted);
}

.corner-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.quality-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}

.chip {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  text-align: center;
}

.chip.active {
  border-color: var(--accent);
  color: var(--accent);
}

.bubble-slider {
  width: 100%;
}

.border-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.border-controls .bubble-slider {
  flex: 1;
}

.border-width-value {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 32px;
}

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(13, 1fr);
  gap: 6px;
}

.swatch-grid-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.swatch {
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.swatch.active {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* The native color input is only the picker trigger — the label is the swatch. */
.swatch-custom {
  display: block;
  overflow: hidden;
  background: conic-gradient(#ef4444, #f59e0b, #84cc16, #06b6d4, #6366f1, #ec4899, #ef4444);
}

.swatch-custom input {
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}

.start-btn {
  align-self: center;
}
</style>
