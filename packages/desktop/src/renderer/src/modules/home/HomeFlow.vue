<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import LogoMark from '../../shared/components/LogoMark.vue'
import { useNavigation, type ModuleId } from '../../composables/useNavigation'
import { useSettings } from '../../composables/useSettings'
import { useHistory } from '../../composables/useHistory'
import { useAgents } from '../../composables/useAgents'
import { useChatSessions } from '../../composables/useChatSessions'

const nav = useNavigation()
const { state: settings } = useSettings()
const { state: history, load: loadHistory } = useHistory()
const { state: agents, load: loadAgents } = useAgents()
const { state: chats, load: loadChats } = useChatSessions()

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// --- Pipeline: a tirinha de "como funciona" que anda sozinha ---------------

interface Stage {
  icon: string
  title: string
  detail: string
}

const STAGES: Stage[] = [
  { icon: '🎞️', title: 'Você solta o arquivo', detail: 'MP4, MOV, MKV, MP3, WAV… arrasta pra dentro e pronto.' },
  { icon: '🎧', title: 'O áudio é extraído', detail: 'O FFmpeg separa a faixa de áudio em segundos, aqui na sua máquina.' },
  { icon: '📝', title: 'A IA transcreve', detail: 'Whisper (Groq na frente, OpenAI no fallback) devolve o texto com a timeline.' },
  { icon: '💬', title: 'Vocês conversam', detail: '"me dá os 3 melhores momentos, curtinhos" — e você refina até gostar.' },
  { icon: '✂️', title: 'Saem os clipes prontos', detail: 'Reels, Shorts, TikTok, 16:9 ou 1:1 — com legenda embutida, se quiser.' }
]

const stageIndex = ref(0)
const pipelinePaused = ref(false)
let stageTimer: ReturnType<typeof setInterval> | null = null

function startPipeline(): void {
  if (prefersReducedMotion || stageTimer) return
  stageTimer = setInterval(() => {
    if (pipelinePaused.value) return
    stageIndex.value = (stageIndex.value + 1) % STAGES.length
  }, 3000)
}

function selectStage(index: number): void {
  stageIndex.value = index
}

// --- Módulos ---------------------------------------------------------------

interface ModuleCard {
  id: ModuleId
  icon: string
  title: string
  blurb: string
  cta: string
}

const CARDS: ModuleCard[] = [
  {
    id: 'chat',
    icon: '💬',
    title: 'Chat de cortes',
    blurb: 'Transcreve o vídeo e escolhe os melhores trechos conversando: "mais curtos", "foca na parte de preço".',
    cta: 'Começar uma conversa'
  },
  {
    id: 'agents',
    icon: '🤖',
    title: 'Agents',
    blurb: 'Guarda um objetivo em texto e o preset de export pra reaproveitar em todo vídeo novo.',
    cta: 'Criar um agente'
  },
  {
    id: 'meetings',
    icon: '🎙️',
    title: 'Reuniões',
    blurb: 'Grava você e os participantes em faixas separadas e a IA escreve a ata: decisões, ações e responsáveis.',
    cta: 'Gravar uma reunião'
  },
  {
    id: 'convert',
    icon: '🔄',
    title: 'Converter',
    blurb: 'Converter, extrair áudio, transcrever ou cortar destaques num wizard de poucos passos.',
    cta: 'Abrir o wizard'
  },
  {
    id: 'compress',
    icon: '📦',
    title: 'Comprimir',
    blurb: 'Aperta o vídeo até o tamanho-alvo em MB — com preset de velocidade e altura máxima.',
    cta: 'Comprimir um vídeo'
  },
  {
    id: 'screencast',
    icon: '🎥',
    title: 'Screencast',
    blurb: 'Grava a tela com microfone e uma bolha de câmera, controlada por uma janelinha flutuante.',
    cta: 'Gravar a tela'
  },
  {
    id: 'subtitle',
    icon: '📝',
    title: 'Legendas',
    blurb: 'Gera o .srt com timeline e aplica no vídeo — embutida (hardsub) ou como faixa que liga e desliga.',
    cta: 'Legendar um vídeo'
  },
  {
    id: 'history',
    icon: '🕐',
    title: 'Histórico',
    blurb: 'Tudo que já rodou, com atalho pra abrir o arquivo gerado ou retomar a conversa de onde parou.',
    cta: 'Ver o histórico'
  }
]

/** Inclina o card na direção do cursor e move o brilho junto. */
function onCardMove(event: MouseEvent): void {
  if (prefersReducedMotion) return
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width - 0.5
  const y = (event.clientY - rect.top) / rect.height - 0.5
  el.style.setProperty('--tilt-x', `${(-y * 7).toFixed(2)}deg`)
  el.style.setProperty('--tilt-y', `${(x * 9).toFixed(2)}deg`)
  el.style.setProperty('--glow-x', `${((x + 0.5) * 100).toFixed(1)}%`)
  el.style.setProperty('--glow-y', `${((y + 0.5) * 100).toFixed(1)}%`)
}

function onCardLeave(event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement
  el.style.setProperty('--tilt-x', '0deg')
  el.style.setProperty('--tilt-y', '0deg')
}

// --- Números ---------------------------------------------------------------

const counters = ref<number[]>([0, 0, 0])
let counterFrame: number | null = null

const stats = computed(() => [
  {
    target: history.entries.length,
    label: history.entries.length === 1 ? 'job no histórico' : 'jobs no histórico',
    module: 'history' as ModuleId
  },
  {
    target: agents.agents.length,
    label: agents.agents.length === 1 ? 'agente salvo' : 'agentes salvos',
    module: 'agents' as ModuleId
  },
  {
    target: chats.sessions.length,
    label: chats.sessions.length === 1 ? 'conversa guardada' : 'conversas guardadas',
    module: 'chat' as ModuleId
  }
])

/** Roda os números de zero até o valor real quando as contagens chegam — pura decoração. */
function runCounters(): void {
  const targets = stats.value.map((s) => s.target)
  if (prefersReducedMotion) {
    counters.value = targets
    return
  }
  const start = performance.now()
  const duration = 700
  const step = (now: number): void => {
    const progress = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    counters.value = targets.map((t) => Math.round(t * eased))
    if (progress < 1) counterFrame = requestAnimationFrame(step)
  }
  counterFrame = requestAnimationFrame(step)
}

const isFirstRun = computed(
  () => history.loaded && !history.entries.length && !agents.agents.length && !chats.sessions.length
)

// --- Estado do ambiente ----------------------------------------------------

const AI_KEYS = ['groqApiKey', 'openaiApiKey', 'anthropicApiKey', 'geminiApiKey', 'openrouterApiKey'] as const

const hasAnyKey = computed(() => AI_KEYS.some((key) => !!settings.config[key]))
const ffmpegOk = computed(() => settings.ffmpeg.installed)

// --- Dicas -----------------------------------------------------------------

const TIPS = [
  'No Chat dá pra pedir "corta mais um segundo antes de cada fala" — ele recorta de novo sem transcrever tudo outra vez.',
  'Um agente guarda o prompt e o formato de export juntos: escolheu o agente, já entra no chat com tudo pronto.',
  'A transcrição tenta a Groq primeiro porque é mais rápida e barata; a OpenAI fica como plano B.',
  'Comprimir por tamanho-alvo é ótimo pra caber no limite de upload de alguém — você diz os MB, ele acha o bitrate.',
  'Na reunião, seu microfone e o som do sistema vão em faixas separadas — por isso a ata sabe quem falou o quê.',
  'Legenda softsub liga e desliga no player; hardsub fica queimada no vídeo, que é o que as redes sociais gostam.',
  'O histórico guarda as opções de cada job — dá pra repetir sem redigitar nada.',
  'CLI e app compartilham o mesmo config.json: configurou a API key num, já vale pro outro.'
]

const tipIndex = ref(Math.floor(Math.random() * TIPS.length))

function nextTip(): void {
  tipIndex.value = (tipIndex.value + 1) % TIPS.length
}

// --- Brincadeira com a logo ------------------------------------------------

const logoClicks = ref(0)
const logoPop = ref(false)
let popTimer: ReturnType<typeof setTimeout> | null = null

const EGG_MESSAGES: Record<number, string> = {
  3: 'Isso aí é uma logo, não um botão de play. Mas obrigado. 🎬',
  7: 'Sete cliques. Já dava pra ter transcrito meia reunião. 🎙️',
  12: 'Ok, você venceu: essa é oficialmente a parte mais divertida do app. ✨'
}

const eggMessage = computed(() => EGG_MESSAGES[logoClicks.value] ?? '')

function onLogoClick(): void {
  logoClicks.value += 1
  logoPop.value = true
  if (popTimer) clearTimeout(popTimer)
  popTimer = setTimeout(() => (logoPop.value = false), 600)
}

// --- Ciclo de vida ---------------------------------------------------------

onMounted(async () => {
  startPipeline()
  await Promise.all([loadHistory(), loadAgents(), loadChats()])
  runCounters()
})

onBeforeUnmount(() => {
  if (stageTimer) clearInterval(stageTimer)
  if (popTimer) clearTimeout(popTimer)
  if (counterFrame) cancelAnimationFrame(counterFrame)
})
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="aurora blob-a" />
      <div class="aurora blob-b" />
      <div class="aurora blob-c" />

      <button class="logo-btn" :class="{ pop: logoPop }" title="Não clica. Ou clica." @click="onLogoClick">
        <LogoMark :size="88" animated />
      </button>

      <h1 class="hero-title">Mediacript</h1>
      <p class="hero-tagline">
        Converta, comprima, transcreva, legende e corte vídeos e áudios com IA —
        <strong>sem abrir o terminal</strong>.
      </p>

      <p v-if="eggMessage" class="egg">{{ eggMessage }}</p>

      <div class="hero-badges">
        <button class="badge" :class="ffmpegOk ? 'ok' : 'warn'" @click="nav.go('help')">
          {{ ffmpegOk ? '✅ FFmpeg pronto' : '⚠️ Instalar o FFmpeg' }}
        </button>
        <button class="badge" :class="hasAnyKey ? 'ok' : 'warn'" @click="nav.go('settings')">
          {{ hasAnyKey ? '🔑 API key configurada' : '🔑 Configurar API key' }}
        </button>
      </div>

      <div class="hero-actions">
        <button class="btn btn-primary" @click="nav.go('chat')">💬 Cortar um vídeo conversando</button>
        <button class="btn" @click="nav.go('convert')">🔄 Só converter mesmo</button>
      </div>
    </section>

    <section class="pipeline" @mouseenter="pipelinePaused = true" @mouseleave="pipelinePaused = false">
      <div class="section-head">
        <h2>Como funciona</h2>
        <span class="section-hint">passa o mouse pra pausar · clica pra pular</span>
      </div>

      <ol class="stage-track">
        <li v-for="(stage, index) in STAGES" :key="stage.title">
          <button
            class="stage"
            :class="{ active: index === stageIndex, done: index < stageIndex }"
            :title="stage.title"
            @click="selectStage(index)"
          >
            <span class="stage-icon">{{ stage.icon }}</span>
            <span class="stage-step">{{ index + 1 }}</span>
          </button>
        </li>
      </ol>

      <div class="stage-detail card">
        <div class="stage-title">{{ STAGES[stageIndex].title }}</div>
        <p class="stage-text">{{ STAGES[stageIndex].detail }}</p>
        <div class="stage-progress">
          <span
            v-for="(stage, index) in STAGES"
            :key="stage.title"
            class="dot"
            :class="{ on: index === stageIndex }"
          />
        </div>
      </div>
    </section>

    <section class="modules">
      <div class="section-head">
        <h2>O que dá pra fazer</h2>
        <span class="section-hint">clica em qualquer um pra ir direto</span>
      </div>

      <div class="module-grid">
        <button
          v-for="card in CARDS"
          :key="card.id"
          class="module-card card"
          @mousemove="onCardMove"
          @mouseleave="onCardLeave"
          @click="nav.go(card.id)"
        >
          <span class="card-glow" />
          <span class="card-icon">{{ card.icon }}</span>
          <span class="card-title">{{ card.title }}</span>
          <span class="card-blurb">{{ card.blurb }}</span>
          <span class="card-cta">{{ card.cta }} →</span>
        </button>
      </div>
    </section>

    <section class="stats">
      <button
        v-for="(stat, index) in stats"
        :key="stat.label"
        class="stat card"
        @click="nav.go(stat.module)"
      >
        <span class="stat-value">{{ counters[index] ?? 0 }}</span>
        <span class="stat-label">{{ stat.label }}</span>
      </button>
    </section>

    <p v-if="isFirstRun" class="first-run">
      Tudo zerado por aqui — é a sua primeira vez. Começa soltando um vídeo no
      <button class="link" @click="nav.go('chat')">Chat</button> e vê no que dá.
    </p>

    <section class="tip card">
      <span class="tip-icon">💡</span>
      <p class="tip-text">{{ TIPS[tipIndex] }}</p>
      <button class="btn btn-ghost tip-next" @click="nextTip">outra dica</button>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* --- Hero ---------------------------------------------------------------- */

.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 28px 20px 32px;
  border-radius: 24px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  overflow: hidden;
}

.aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  opacity: 0.4;
  pointer-events: none;
}

.blob-a {
  width: 260px;
  height: 200px;
  left: -60px;
  top: -70px;
  background: radial-gradient(circle, #7c6cf6, transparent 70%);
  animation: drift-a 16s ease-in-out infinite;
}

.blob-b {
  width: 300px;
  height: 220px;
  right: -70px;
  bottom: -90px;
  background: radial-gradient(circle, #38d9d9, transparent 70%);
  animation: drift-b 20s ease-in-out infinite;
}

.blob-c {
  width: 220px;
  height: 180px;
  left: 45%;
  top: -90px;
  background: radial-gradient(circle, #ec6cc0, transparent 70%);
  animation: drift-c 18s ease-in-out infinite;
}

@keyframes drift-a {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(30px, 20px);
  }
}

@keyframes drift-b {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-26px, -18px);
  }
}

@keyframes drift-c {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(18px, 26px);
  }
}

.logo-btn {
  position: relative;
  border: none;
  background: transparent;
  padding: 0;
  border-radius: 22px;
  transition: transform 0.2s ease;
}

.logo-btn:hover {
  transform: translateY(-3px) rotate(-3deg);
}

.logo-btn:active {
  transform: scale(0.94);
}

.logo-btn.pop {
  animation: logo-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes logo-pop {
  0% {
    transform: scale(1) rotate(0deg);
  }
  40% {
    transform: scale(1.18) rotate(8deg);
  }
  70% {
    transform: scale(0.96) rotate(-4deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

.hero-title {
  margin: 0;
  font-size: 30px;
  letter-spacing: -0.5px;
}

.hero-tagline {
  margin: 0;
  max-width: 520px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.55;
}

.egg {
  margin: 0;
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 2px;
}

.badge {
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-muted);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
}

.badge.ok {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 35%, transparent);
}

.badge.warn {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 45%, transparent);
}

button.badge:hover {
  border-color: var(--accent);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}

/* --- Seções -------------------------------------------------------------- */

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-head h2 {
  font-size: 18px;
  margin: 0;
}

.section-hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* --- Pipeline ------------------------------------------------------------ */

.stage-track {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.stage-track li {
  flex: 1;
  display: flex;
  justify-content: center;
  position: relative;
}

.stage-track li + li::before {
  content: '';
  position: absolute;
  left: -50%;
  top: 50%;
  width: 100%;
  height: 2px;
  background: var(--border);
  z-index: 0;
}

.stage {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.stage:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.stage.done {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}

.stage.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-elevated));
  transform: scale(1.1);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 15%, transparent);
}

.stage-icon {
  font-size: 20px;
  line-height: 1;
}

.stage-step {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
}

.stage-detail {
  padding: 14px 16px;
  text-align: center;
}

.stage-title {
  font-weight: 700;
  font-size: 15px;
}

.stage-text {
  margin: 6px 0 10px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.stage-progress {
  display: flex;
  justify-content: center;
  gap: 5px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border);
  transition: background 0.2s ease, width 0.2s ease;
}

.dot.on {
  width: 18px;
  border-radius: 3px;
  background: var(--accent);
}

/* --- Cards dos módulos --------------------------------------------------- */

.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.module-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px;
  text-align: left;
  transform: perspective(700px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.module-card:hover {
  border-color: var(--accent);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
}

.card-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    240px circle at var(--glow-x, 50%) var(--glow-y, 50%),
    color-mix(in srgb, var(--accent) 16%, transparent),
    transparent 70%
  );
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
}

.module-card:hover .card-glow {
  opacity: 1;
}

.card-icon {
  font-size: 24px;
  line-height: 1;
  transition: transform 0.2s ease;
}

.module-card:hover .card-icon {
  transform: scale(1.15) rotate(-6deg);
}

.card-title {
  font-weight: 700;
  font-size: 14px;
  color: var(--text);
}

.card-blurb {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.card-cta {
  margin-top: auto;
  padding-top: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.module-card:hover .card-cta {
  opacity: 1;
  transform: translateX(0);
}

/* --- Números ------------------------------------------------------------- */

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 14px;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.stat:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
}

.first-run {
  margin: -12px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--accent);
  font-weight: 700;
  font-size: 13px;
  text-decoration: underline;
}

/* --- Dica ---------------------------------------------------------------- */

.tip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.tip-icon {
  font-size: 18px;
}

.tip-text {
  flex: 1;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-muted);
}

.tip-next {
  font-size: 11px;
  padding: 6px 10px;
  color: var(--accent);
  white-space: nowrap;
}

@media (max-width: 700px) {
  .stats {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .aurora,
  .logo-btn.pop {
    animation: none;
  }

  .module-card,
  .stage,
  .stat,
  .logo-btn {
    transition: none;
  }
}
</style>
