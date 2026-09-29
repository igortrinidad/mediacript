<script setup lang="ts">
import { modelOptionLabel } from '../../../shared/modelLabel'
import { computed, onMounted, ref } from 'vue'
import type { AIProviderName, MeetingCreateRequest, MeetingPlatformSupport, SystemAudioMode } from '@shared/types'
import { useAgents } from '../../../composables/useAgents'
import { useSettings } from '../../../composables/useSettings'
import { CUSTOM_MODEL } from '../../../shared/constants'
import { listAudioInputs, type AudioDeviceOption } from '../composables/useMeetingRecorder'

defineProps<{
  /** True while the parent is actually opening the audio streams — keeps a second click from starting two recordings. */
  busy?: boolean
}>()

const emit = defineEmits<{
  start: [request: MeetingCreateRequest]
}>()

const { state: agentsState, load: loadAgents } = useAgents()
const { state: settings, load: loadSettings } = useSettings()

const support = ref<MeetingPlatformSupport | null>(null)
const devices = ref<AudioDeviceOption[]>([])
const loading = ref(true)
const error = ref('')

const title = ref('')
const micEnabled = ref(true)
const micDeviceId = ref('')
const systemAudioMode = ref<SystemAudioMode>('none')
const systemAudioDeviceId = ref('')

const selectedAgentId = ref<string | null>(null)
const provider = ref<AIProviderName>('anthropic')
const modelChoice = ref('')
const customModel = ref('')

const providerModels = computed(
  () => settings.aiProviders.find((option) => option.provider === provider.value)?.models ?? []
)
const providerPricing = computed(() => settings.aiProviders.find((option) => option.provider === provider.value)?.pricing)

const monitorDevices = computed(() => devices.value.filter((device) => device.isMonitor))

const defaultTitle = computed(() => `Reunião ${new Date().toLocaleDateString('pt-BR')}`)

async function refreshDevices(): Promise<void> {
  devices.value = await listAudioInputs()
  if (!micDeviceId.value) micDeviceId.value = devices.value[0]?.deviceId ?? ''
  if (!systemAudioDeviceId.value) {
    systemAudioDeviceId.value = monitorDevices.value[0]?.deviceId ?? devices.value[0]?.deviceId ?? ''
  }
}

onMounted(async () => {
  try {
    support.value = await window.api.meetings.platformSupport()
    // Where the OS can't hand us the system output directly, the fallback is a
    // monitor/virtual-cable input — pre-select that path so the option the user
    // actually has is the one already showing.
    systemAudioMode.value = support.value.loopbackSupported ? 'loopback' : 'device'

    await Promise.all([refreshDevices(), loadAgents(), loadSettings()])

    const firstConfigured = settings.aiProviders.find((option) => option.hasApiKey) ?? settings.aiProviders[0]
    if (firstConfigured) {
      provider.value = firstConfigured.provider
      modelChoice.value = firstConfigured.models[0] ?? CUSTOM_MODEL
    }
  } catch (err: any) {
    error.value = err?.message || 'Não foi possível preparar a gravação'
  } finally {
    loading.value = false
  }
})

function onProviderChange(): void {
  modelChoice.value = providerModels.value[0] ?? CUSTOM_MODEL
}

function start(): void {
  const agent = agentsState.agents.find((item) => item.id === selectedAgentId.value) ?? null
  const model = modelChoice.value === CUSTOM_MODEL ? customModel.value.trim() : modelChoice.value

  if (!model) {
    error.value = 'Escolha o modelo de IA que vai escrever a ata.'
    return
  }
  if (!micEnabled.value && systemAudioMode.value === 'none') {
    error.value = 'Selecione pelo menos uma fonte de áudio.'
    return
  }

  error.value = ''

  emit('start', {
    title: title.value.trim() || defaultTitle.value,
    setup: {
      micDeviceId: micEnabled.value ? micDeviceId.value || undefined : undefined,
      systemAudioMode: systemAudioMode.value,
      systemAudioDeviceId: systemAudioMode.value === 'device' ? systemAudioDeviceId.value || undefined : undefined
    },
    provider: provider.value,
    model,
    agentId: agent?.id,
    objective: agent?.prompt
  })
}
</script>

<template>
  <div class="meeting-setup">
    <p class="step-intro">
      Grave o microfone e o som do computador ao mesmo tempo. Ao final, a IA transcreve os dois lados e escreve a ata
      da reunião.
    </p>

    <div v-if="loading" class="hint">Preparando dispositivos de áudio…</div>

    <template v-else>
      <div class="section">
        <label class="field-label" for="meeting-title">Título da reunião</label>
        <input id="meeting-title" v-model="title" class="text-input" type="text" :placeholder="defaultTitle" />
      </div>

      <div class="section card-box">
        <div class="toggle-row">
          <label class="toggle-label">
            <input v-model="micEnabled" type="checkbox" />
            🎤 Gravar meu microfone
          </label>
          <button class="btn btn-ghost btn-refresh" type="button" @click="refreshDevices">↻ Atualizar</button>
        </div>
        <select v-if="micEnabled" v-model="micDeviceId" class="device-select">
          <option v-for="device in devices" :key="device.deviceId" :value="device.deviceId">
            {{ device.label }}
          </option>
        </select>
      </div>

      <div class="section card-box">
        <span class="field-label">🔊 Som do computador (os outros participantes)</span>

        <div class="chip-row">
          <button
            v-if="support?.loopbackSupported"
            type="button"
            class="chip"
            :class="{ active: systemAudioMode === 'loopback' }"
            @click="systemAudioMode = 'loopback'"
          >
            Captura automática
          </button>
          <button
            type="button"
            class="chip"
            :class="{ active: systemAudioMode === 'device' }"
            @click="systemAudioMode = 'device'"
          >
            Dispositivo (monitor/cabo virtual)
          </button>
          <button
            type="button"
            class="chip"
            :class="{ active: systemAudioMode === 'none' }"
            @click="systemAudioMode = 'none'"
          >
            Não gravar
          </button>
        </div>

        <p class="hint">{{ support?.note }}</p>

        <template v-if="systemAudioMode === 'device'">
          <select v-model="systemAudioDeviceId" class="device-select">
            <option v-for="device in devices" :key="device.deviceId" :value="device.deviceId">
              {{ device.isMonitor ? '★ ' : '' }}{{ device.label }}
            </option>
          </select>
          <p v-if="!monitorDevices.length" class="warning-text">
            Nenhum dispositivo de retorno detectado. Ative o "Mixagem estéreo" (Windows), use um monitor do PulseAudio
            (Linux) ou instale um driver virtual como o BlackHole (macOS).
          </p>
        </template>
      </div>

      <div class="section card-box">
        <span class="field-label">🤖 Como a ata deve ser escrita</span>

        <div class="agent-grid">
          <button class="agent-card" :class="{ active: selectedAgentId === null }" @click="selectedAgentId = null">
            <div class="agent-name">Ata padrão</div>
            <div class="agent-desc">Resumo, decisões, ações com responsáveis e pauta da próxima reunião.</div>
          </button>
          <button
            v-for="agent in agentsState.agents"
            :key="agent.id"
            class="agent-card"
            :class="{ active: selectedAgentId === agent.id }"
            @click="selectedAgentId = agent.id"
          >
            <div class="agent-name">{{ agent.name }}</div>
            <div class="agent-desc">{{ agent.prompt }}</div>
          </button>
        </div>

        <div class="model-row">
          <select v-model="provider" class="device-select" @change="onProviderChange">
            <option v-for="option in settings.aiProviders" :key="option.provider" :value="option.provider">
              {{ option.label }}{{ option.hasApiKey ? '' : ' (sem API key)' }}
            </option>
          </select>
          <select v-model="modelChoice" class="device-select">
            <option v-for="model in providerModels" :key="model" :value="model">{{ modelOptionLabel(model, providerPricing) }}</option>
            <option :value="CUSTOM_MODEL">Outro modelo…</option>
          </select>
        </div>
        <input
          v-if="modelChoice === CUSTOM_MODEL"
          v-model="customModel"
          class="text-input"
          type="text"
          placeholder="ID do modelo"
        />
      </div>

      <p class="consent-note">
        ⚠️ Avise os participantes antes de gravar — em muitos lugares a gravação de uma conversa exige o consentimento
        de todos.
      </p>

      <p v-if="error" class="error-text">{{ error }}</p>

      <button class="btn btn-primary start-btn" type="button" :disabled="busy" @click="start">
        {{ busy ? 'Iniciando…' : '● Iniciar gravação' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.meeting-setup {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.card-box {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 10px;
  padding: 12px;
}

.field-label {
  font-weight: 600;
  font-size: 13px;
}

.text-input,
.device-select {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 12px;
  width: 100%;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.btn-refresh {
  font-size: 11px;
  padding: 4px 8px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
}

.chip.active {
  border-color: var(--accent);
  color: var(--accent);
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.warning-text {
  font-size: 12px;
  color: var(--warning);
  margin: 0;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.agent-card {
  text-align: left;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 12px;
}

.agent-card.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg));
}

.agent-name {
  font-weight: 600;
  font-size: 13px;
}

.agent-desc {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.model-row {
  display: flex;
  gap: 8px;
}

.consent-note {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
  text-align: center;
}

.error-text {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}

.start-btn {
  align-self: center;
  padding: 11px 22px;
  font-size: 14px;
}
</style>
