<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useUpdates } from '../../composables/useUpdates'

const emit = defineEmits<{
  select: [view: 'api-keys' | 'fallback-ai' | 'general' | 'appearance']
}>()

const updates = useUpdates()

onMounted(() => {
  updates.loadCurrentVersion()
})

const updateStatus = computed(() => {
  const { phase, update, error } = updates.state
  switch (phase) {
    case 'checking':
      return 'Verificando…'
    case 'up-to-date':
      return 'Você está na versão mais recente.'
    case 'available':
    case 'downloading':
    case 'ready':
    case 'installing':
      return update ? `Nova versão disponível: v${update.latestVersion}` : ''
    case 'error':
      return error ?? 'Falha ao verificar atualizações'
    default:
      return ''
  }
})

const hasUpdate = computed(() => !!updates.state.update)

function onCheck(): void {
  if (hasUpdate.value) updates.openDialog()
  else updates.check(true)
}

const ROWS = [
  { id: 'api-keys' as const, icon: '🔑', label: 'Chaves de API', description: 'Transcrição e IA — salvas só neste computador' },
  { id: 'fallback-ai' as const, icon: '🤖', label: 'IA de destaques (fallback)', description: 'Ordem de modelos alternativos' },
  { id: 'general' as const, icon: '📁', label: 'Geral', description: 'Pasta de saída padrão' },
  { id: 'appearance' as const, icon: '🎨', label: 'Aparência', description: 'Tema claro, escuro ou do sistema' }
]
</script>

<template>
  <div class="settings-home">
    <h2>Settings</h2>
    <ul class="settings-list">
      <li v-for="row in ROWS" :key="row.id" class="settings-row card" @click="emit('select', row.id)">
        <span class="row-icon">{{ row.icon }}</span>
        <div class="row-text">
          <div class="row-label">{{ row.label }}</div>
          <div class="row-description">{{ row.description }}</div>
        </div>
        <span class="row-chevron">›</span>
      </li>
    </ul>

    <footer class="about card">
      <div class="about-text">
        <div class="about-version">Mediacript v{{ updates.state.currentVersion || '…' }}</div>
        <div class="about-status" :class="{ highlight: hasUpdate, error: updates.state.phase === 'error' }">
          {{ updateStatus || 'Atualizações são verificadas ao abrir o app.' }}
        </div>
      </div>
      <button class="btn" :class="{ 'btn-primary': hasUpdate }" :disabled="updates.state.phase === 'checking'" @click="onCheck">
        {{ hasUpdate ? 'Atualizar' : 'Verificar atualizações' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.settings-home {
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-home h2 {
  font-size: 18px;
  margin: 0;
}

.settings-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.settings-row:hover {
  border-color: var(--accent);
}

.row-icon {
  font-size: 20px;
}

.row-text {
  flex: 1;
}

.row-label {
  font-weight: 600;
  font-size: 14px;
}

.row-description {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 2px;
}

.row-chevron {
  color: var(--text-muted);
  font-size: 18px;
}

.about {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-top: 8px;
}

.about-text {
  flex: 1;
  min-width: 0;
}

.about-version {
  font-weight: 600;
  font-size: 14px;
  /* Worth being able to copy into a bug report. */
  user-select: text;
}

.about-status {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 2px;
}

.about-status.highlight {
  color: var(--accent);
  font-weight: 600;
}

.about-status.error {
  color: var(--danger);
}
</style>
