<script setup lang="ts">
import BottomNav from './BottomNav.vue'
import LogoMark from '../shared/components/LogoMark.vue'
import { useNavigation } from '../composables/useNavigation'
import HomeFlow from '../modules/home/HomeFlow.vue'
import ChatFlow from '../modules/chat/ChatFlow.vue'
import AgentsFlow from '../modules/agents/AgentsFlow.vue'
import MeetingsFlow from '../modules/meetings/MeetingsFlow.vue'
import ConvertFlow from '../modules/convert/ConvertFlow.vue'
import CompressFlow from '../modules/compress/CompressFlow.vue'
import ScreencastFlow from '../modules/screencast/ScreencastFlow.vue'
import SubtitleFlow from '../modules/subtitle/SubtitleFlow.vue'
import HistoryFlow from '../modules/history/HistoryFlow.vue'
import SettingsFlow from '../modules/settings/SettingsFlow.vue'
import HelpFlow from '../modules/help/HelpFlow.vue'
import { useSettings } from '../composables/useSettings'
import { onMounted, ref, watch } from 'vue'

const nav = useNavigation()
const { load: loadSettings } = useSettings()

const content = ref<HTMLElement | null>(null)

onMounted(() => {
  loadSettings()
})

// All modules share this one scroll container, so without this a module opened
// after scrolling through another one starts halfway down the page.
watch(
  () => nav.state.active,
  () => content.value?.scrollTo({ top: 0 })
)
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <button class="brand" title="Voltar para o início" @click="nav.go('home')">
        <LogoMark :size="20" />
        <span class="brand-name">Mediacript</span>
      </button>
    </header>

    <main ref="content" class="content">
      <HomeFlow v-if="nav.state.active === 'home'" />
      <ChatFlow v-show="nav.state.active === 'chat'" />
      <AgentsFlow v-if="nav.state.active === 'agents'" />
      <MeetingsFlow v-if="nav.state.active === 'meetings'" />
      <ConvertFlow v-if="nav.state.active === 'convert'" />
      <CompressFlow v-if="nav.state.active === 'compress'" />
      <ScreencastFlow v-if="nav.state.active === 'screencast'" />
      <SubtitleFlow v-if="nav.state.active === 'subtitle'" />
      <HistoryFlow v-if="nav.state.active === 'history'" />
      <SettingsFlow v-if="nav.state.active === 'settings'" />
      <HelpFlow v-if="nav.state.active === 'help'" />
    </main>

    <BottomNav :active="nav.state.active" @select="nav.go" />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.topbar {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
  -webkit-app-region: drag;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--text);
  font-weight: 700;
  font-size: 15px;
  /* The topbar itself is the window drag handle, so the button has to opt out. */
  -webkit-app-region: no-drag;
}

.brand:hover {
  color: var(--accent);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px 140px;
}
</style>
