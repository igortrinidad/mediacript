<script setup lang="ts">
export type ModuleId =
  | 'home'
  | 'chat'
  | 'agents'
  | 'meetings'
  | 'convert'
  | 'compress'
  | 'screencast'
  | 'subtitle'
  | 'history'
  | 'settings'
  | 'help'

defineProps<{
  active: ModuleId
}>()

const emit = defineEmits<{
  select: [module: ModuleId]
}>()

const ITEMS: { id: ModuleId; label: string; icon: string }[] = [
  { id: 'home', label: 'Início', icon: '🏠' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'meetings', label: 'Reuniões', icon: '🎙️' },
  { id: 'convert', label: 'Convert', icon: '🔄' },
  { id: 'compress', label: 'Comprimir', icon: '📦' },
  { id: 'screencast', label: 'Screencast', icon: '🎥' },
  { id: 'subtitle', label: 'Legendas', icon: '📝' },
  { id: 'history', label: 'History', icon: '🕐' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'help', label: 'Ajuda', icon: '❓' }
]
</script>

<template>
  <nav class="bottom-nav">
    <div class="aurora-blob blob-a" />
    <div class="aurora-blob blob-b" />
    <div class="aurora-blob blob-c" />

    <button
      v-for="item in ITEMS"
      :key="item.id"
      class="nav-item"
      :class="{ active: active === item.id }"
      @click="emit('select', item.id)"
    >
      <span class="nav-icon">{{ item.icon }}</span>
      <span class="nav-label">{{ item.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  background: color-mix(in srgb, var(--bg-elevated) 55%, transparent);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  z-index: 40;
  -webkit-app-region: no-drag;
}

.aurora-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(30px);
  opacity: 0.35;
  z-index: -1;
  pointer-events: none;
}

.blob-a {
  width: 120px;
  height: 90px;
  left: -20px;
  top: -30px;
  background: radial-gradient(circle, #7c6cf6, transparent 70%);
  animation: drift-a 14s ease-in-out infinite;
}

.blob-b {
  width: 140px;
  height: 100px;
  right: -10px;
  bottom: -40px;
  background: radial-gradient(circle, #38d9d9, transparent 70%);
  animation: drift-b 18s ease-in-out infinite;
}

.blob-c {
  width: 110px;
  height: 90px;
  left: 40%;
  top: -40px;
  background: radial-gradient(circle, #ec6cc0, transparent 70%);
  animation: drift-c 16s ease-in-out infinite;
}

@keyframes drift-a {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(18px, 12px); }
}

@keyframes drift-b {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(-16px, -10px); }
}

@keyframes drift-c {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(10px, 16px); }
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  padding: 8px 14px;
  border-radius: 16px;
  font-size: 10px;
  font-weight: 600;
  transition: background 0.15s ease, color 0.15s ease;
}

.nav-item:hover {
  color: var(--text);
}

.nav-item.active {
  color: var(--accent-contrast);
  background: color-mix(in srgb, var(--accent) 85%, transparent);
}

.nav-icon {
  font-size: 18px;
  line-height: 1;
}

.nav-label {
  letter-spacing: 0.2px;
}
</style>
