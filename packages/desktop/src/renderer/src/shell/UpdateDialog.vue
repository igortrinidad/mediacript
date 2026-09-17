<script setup lang="ts">
import { computed } from 'vue'
import { useUpdates } from '../composables/useUpdates'
import { renderMarkdown } from '../shared/markdown'

const { state, downloadAndInstall, install, openReleasePage, dismissDialog } = useUpdates()

const update = computed(() => state.update)
const busy = computed(() => state.phase === 'downloading' || state.phase === 'installing')

const notesHtml = computed(() => (update.value?.releaseNotes ? renderMarkdown(update.value.releaseNotes) : ''))

const sizeMb = computed(() => {
  const size = update.value?.asset?.size
  return size ? (size / 1024 / 1024).toFixed(0) : null
})

const progressLabel = computed(() => {
  const p = state.progress
  if (!p) return ''
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
  return p.total ? `${mb(p.received)} / ${mb(p.total)} MB` : `${mb(p.received)} MB`
})

const primaryLabel = computed(() => {
  if (!update.value) return ''
  if (update.value.installMethod === 'manual') return 'Abrir página de download'
  if (state.phase === 'downloading') return 'Baixando…'
  if (state.phase === 'installing') return 'Instalando…'
  if (state.phase === 'ready') return 'Instalar e reiniciar'
  return sizeMb.value ? `Baixar e instalar (${sizeMb.value} MB)` : 'Baixar e instalar'
})

const installHint = computed(() => {
  switch (update.value?.installMethod) {
    case 'windows-installer':
      return 'O Mediacript vai fechar e o instalador abre em seguida. Suas configurações e histórico são mantidos.'
    case 'mac-dmg':
      return 'O Mediacript vai fechar, a nova versão é copiada para a pasta Aplicativos (já liberada do Gatekeeper) e o app reabre sozinho.'
    default:
      return 'Não há instalador automático para este sistema — baixe a nova versão pela página da release.'
  }
})

function onPrimary(): void {
  if (state.phase === 'ready') install()
  else downloadAndInstall()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="state.dialogOpen && update" class="update-backdrop" @click.self="!busy && dismissDialog()">
      <div class="update-dialog card" role="dialog" aria-modal="true" aria-labelledby="update-title">
        <div class="update-icon">🚀</div>
        <h2 id="update-title">Nova versão disponível</h2>
        <p class="update-versions">
          <strong>v{{ update.latestVersion }}</strong>
          <span class="muted"> — você está na v{{ update.currentVersion }}</span>
        </p>

        <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown escapes the release body before adding its own tags -->
        <div v-if="notesHtml" class="update-notes" v-html="notesHtml"></div>

        <div v-if="state.phase === 'downloading' && state.progress" class="update-progress">
          <div class="progress-track">
            <div
              class="progress-fill"
              :class="{ indeterminate: state.progress.percent < 0 }"
              :style="state.progress.percent >= 0 ? { width: `${state.progress.percent}%` } : undefined"
            ></div>
          </div>
          <div class="progress-label">
            <span>{{ state.progress.percent >= 0 ? `${state.progress.percent}%` : 'Baixando…' }}</span>
            <span>{{ progressLabel }}</span>
          </div>
        </div>

        <p v-if="state.phase === 'error' && state.error" class="update-error">⚠️ {{ state.error }}</p>

        <p class="update-hint">{{ installHint }}</p>

        <div class="update-actions">
          <button class="btn btn-ghost" :disabled="busy" @click="dismissDialog">Depois</button>
          <button class="btn btn-ghost" :disabled="busy" @click="openReleasePage">Ver no GitHub</button>
          <button class="btn btn-primary" :disabled="busy" @click="onPrimary">{{ primaryLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.update-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.update-dialog {
  width: 100%;
  max-width: 480px;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  padding: 24px;
  gap: 10px;
}

.update-icon {
  font-size: 32px;
  line-height: 1;
}

.update-dialog h2 {
  margin: 0;
  font-size: 18px;
}

.update-versions {
  margin: 0;
  font-size: 14px;
}

.muted {
  color: var(--text-muted);
}

.update-notes {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  font-size: 13px;
  line-height: 1.5;
  user-select: text;
  max-height: 220px;
}

.update-notes :deep(h2),
.update-notes :deep(h3),
.update-notes :deep(h4) {
  margin: 6px 0 4px;
  font-size: 13px;
}

.update-notes :deep(p) {
  margin: 4px 0;
}

.update-notes :deep(ul) {
  margin: 4px 0;
  padding-left: 18px;
}

.update-notes :deep(code) {
  font-size: 12px;
  background: var(--border);
  padding: 1px 4px;
  border-radius: 4px;
}

.update-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-track {
  height: 8px;
  border-radius: 4px;
  background: var(--border);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.15s ease;
}

.progress-fill.indeterminate {
  width: 40%;
  animation: slide 1.2s ease-in-out infinite;
}

@keyframes slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted);
}

.update-error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}

.update-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}
</style>
