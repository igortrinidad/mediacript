<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSettings } from '../../composables/useSettings'
import { useClipboard } from '../../composables/useClipboard'
import { useNavigation } from '../../composables/useNavigation'

const { state: settings, checkFfmpeg } = useSettings()
const { copiedKey, copy } = useClipboard()
const nav = useNavigation()

// --- Sistemas --------------------------------------------------------------

type OsId = 'windows' | 'macos' | 'linux'

interface Recipe {
  /** Package manager or approach, e.g. "winget" */
  name: string
  /** Why someone would pick this one */
  note: string
  commands: string[]
}

interface OsGuide {
  id: OsId
  label: string
  icon: string
  /** The one we tell most people to use */
  primary: Recipe
  alternatives: Recipe[]
  /** OS-specific gotcha shown under the commands */
  gotcha: string
}

const GUIDES: OsGuide[] = [
  {
    id: 'windows',
    label: 'Windows',
    icon: '🪟',
    primary: {
      name: 'winget',
      note: 'Já vem no Windows 10 e 11 — é o caminho mais curto.',
      commands: ['winget install --id=Gyan.FFmpeg -e']
    },
    alternatives: [
      {
        name: 'Chocolatey',
        note: 'Se você já usa o choco. Precisa de um terminal como administrador.',
        commands: ['choco install ffmpeg']
      },
      {
        name: 'Scoop',
        note: 'Instala no seu usuário, sem pedir administrador.',
        commands: ['scoop install ffmpeg']
      },
      {
        name: 'Na mão',
        note: 'Baixe o build em gyan.dev, extraia em C:\\ffmpeg e adicione C:\\ffmpeg\\bin ao PATH (Painel de Controle → Variáveis de ambiente).',
        commands: []
      }
    ],
    gotcha:
      'O PATH só é lido quando um programa abre. Depois de instalar, feche o Mediacript e abra de novo — senão ele continua sem enxergar o ffmpeg.'
  },
  {
    id: 'macos',
    label: 'macOS',
    icon: '🍎',
    primary: {
      name: 'Homebrew',
      note: 'O jeito padrão no macOS.',
      commands: ['brew install ffmpeg']
    },
    alternatives: [
      {
        name: 'Instalar o Homebrew antes',
        note: 'Se o comando brew não existir ainda, rode isto primeiro.',
        commands: ['/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"']
      },
      {
        name: 'MacPorts',
        note: 'Alternativa ao Homebrew.',
        commands: ['sudo port install ffmpeg']
      }
    ],
    gotcha:
      'Em Mac com Apple Silicon o Homebrew instala em /opt/homebrew/bin, e apps abertos pelo Finder nem sempre herdam esse caminho. Se o terminal acha o ffmpeg mas o app não, abra o app pelo terminal uma vez com: open -a Mediacript'
  },
  {
    id: 'linux',
    label: 'Linux',
    icon: '🐧',
    primary: {
      name: 'Debian / Ubuntu',
      note: 'apt — também vale para Mint, Pop!_OS e afins.',
      commands: ['sudo apt update', 'sudo apt install ffmpeg']
    },
    alternatives: [
      {
        name: 'Fedora',
        note: 'O pacote ffmpeg-free está nos repositórios oficiais.',
        commands: ['sudo dnf install ffmpeg-free']
      },
      {
        name: 'Arch / Manjaro',
        note: 'pacman.',
        commands: ['sudo pacman -S ffmpeg']
      },
      {
        name: 'openSUSE',
        note: 'zypper.',
        commands: ['sudo zypper install ffmpeg']
      }
    ],
    gotcha:
      'Se você abriu o Mediacript pelo menu do sistema antes de instalar, feche e abra de novo para ele reler o PATH.'
  }
]

/** What the app is actually running on — used to preselect a tab, not to hide the others. */
const detected = computed<OsId | null>(() => {
  const platform = window.api.system.platform
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  return null
})

const selectedOs = ref<OsId>(detected.value ?? 'windows')
const guide = computed(() => GUIDES.find((g) => g.id === selectedOs.value) ?? GUIDES[0])
const showAlternatives = ref(false)

function selectOs(id: OsId): void {
  selectedOs.value = id
  showAlternatives.value = false
}

// --- Verificação -----------------------------------------------------------

const checking = ref(false)
/** Set only after the user presses the button, so we can celebrate a fresh install. */
const lastCheckFailed = ref(false)
const justSucceeded = ref(false)

const installed = computed(() => settings.ffmpeg.installed)

async function recheck(): Promise<void> {
  checking.value = true
  justSucceeded.value = false
  // A probe that answers in 20ms reads as a button that did nothing.
  const [status] = await Promise.all([checkFfmpeg(), new Promise((r) => setTimeout(r, 600))])
  checking.value = false
  lastCheckFailed.value = !status.installed
  justSucceeded.value = status.installed
}

/** Which of the three steps to highlight right now. */
const currentStep = computed(() => (installed.value ? 3 : lastCheckFailed.value ? 2 : 1))

const STEPS = [
  { n: 1, label: 'Instalar', detail: 'Rode o comando do seu sistema abaixo.' },
  { n: 2, label: 'Reabrir o app', detail: 'Feche o Mediacript e abra de novo para ele reler o PATH.' },
  { n: 3, label: 'Conferir', detail: 'Clique em "Verificar de novo" — o selo aqui em cima vira verde.' }
]

onMounted(() => {
  if (!settings.loaded) void checkFfmpeg()
})
</script>

<template>
  <div class="help">
    <header class="help-head">
      <h2>Instalar o FFmpeg</h2>
      <p class="lead">
        O FFmpeg é o motor que corta, converte e comprime os arquivos — o Mediacript conversa com ele.
        É um programa único, gratuito, e você instala uma vez só.
      </p>
    </header>

    <!-- Selo de status -->
    <section class="status card" :class="{ ok: installed, missing: !installed, celebrate: justSucceeded }">
      <span class="status-icon">{{ installed ? '✅' : '⚠️' }}</span>
      <div class="status-text">
        <div class="status-title">
          {{ installed ? 'FFmpeg encontrado' : 'FFmpeg não encontrado neste computador' }}
        </div>
        <div v-if="installed && settings.ffmpeg.version" class="status-detail">
          {{ settings.ffmpeg.version }}
        </div>
        <div v-else-if="installed" class="status-detail">Está tudo pronto pra converter.</div>
        <div v-else class="status-detail">Siga os passos abaixo — leva um ou dois minutos.</div>
      </div>
      <button class="btn" :disabled="checking" @click="recheck">
        {{ checking ? 'Verificando…' : 'Verificar de novo' }}
      </button>
    </section>

    <p v-if="justSucceeded" class="celebrate-note">
      🎉 Achamos! Pode voltar pro trabalho —
      <button class="link" @click="nav.go('chat')">abrir o Chat</button> ou
      <button class="link" @click="nav.go('home')">voltar pro início</button>.
    </p>
    <p v-else-if="lastCheckFailed" class="retry-note">
      Ainda não apareceu. Se você acabou de instalar, o passo que costuma faltar é o 2: fechar e abrir o
      Mediacript de novo.
    </p>

    <!-- Os três passos -->
    <ol class="steps">
      <li v-for="step in STEPS" :key="step.n" class="step" :class="{ active: step.n === currentStep, done: step.n < currentStep }">
        <span class="step-n">{{ step.n < currentStep ? '✓' : step.n }}</span>
        <div>
          <div class="step-label">{{ step.label }}</div>
          <div class="step-detail">{{ step.detail }}</div>
        </div>
      </li>
    </ol>

    <!-- Abas de sistema -->
    <section class="os">
      <div class="os-tabs">
        <button
          v-for="g in GUIDES"
          :key="g.id"
          class="os-tab"
          :class="{ active: selectedOs === g.id }"
          @click="selectOs(g.id)"
        >
          <span class="os-icon">{{ g.icon }}</span>
          <span>{{ g.label }}</span>
          <span v-if="detected === g.id" class="os-detected">seu sistema</span>
        </button>
      </div>

      <div class="os-body card">
        <div class="recipe-head">
          <h3>{{ guide.primary.name }}</h3>
          <span class="recommended">recomendado</span>
        </div>
        <p class="recipe-note">{{ guide.primary.note }}</p>

        <div v-for="(command, index) in guide.primary.commands" :key="command" class="command">
          <code>{{ command }}</code>
          <button class="btn btn-ghost copy" @click="copy(`primary-${index}`, command)">
            {{ copiedKey === `primary-${index}` ? 'Copiado!' : 'Copiar' }}
          </button>
        </div>

        <p class="gotcha">💡 {{ guide.gotcha }}</p>

        <button class="btn btn-ghost toggle" @click="showAlternatives = !showAlternatives">
          {{ showAlternatives ? 'Esconder' : 'Outras formas de instalar no ' + guide.label }}
          <span class="chevron" :class="{ open: showAlternatives }">›</span>
        </button>

        <div v-if="showAlternatives" class="alternatives">
          <div v-for="alt in guide.alternatives" :key="alt.name" class="alternative">
            <div class="alt-name">{{ alt.name }}</div>
            <p class="alt-note">{{ alt.note }}</p>
            <div v-for="command in alt.commands" :key="command" class="command">
              <code>{{ command }}</code>
              <button class="btn btn-ghost copy" @click="copy(command, command)">
                {{ copiedKey === command ? 'Copiado!' : 'Copiar' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Conferir por fora -->
    <section class="verify card">
      <h3>Quer conferir por fora do app?</h3>
      <p class="verify-note">
        Abra o terminal ({{ selectedOs === 'windows' ? 'PowerShell ou Prompt de Comando' : 'Terminal' }}) e rode:
      </p>
      <div class="command">
        <code>ffmpeg -version</code>
        <button class="btn btn-ghost copy" @click="copy('verify', 'ffmpeg -version')">
          {{ copiedKey === 'verify' ? 'Copiado!' : 'Copiar' }}
        </button>
      </div>
      <p class="verify-note">
        Se aparecer um monte de texto começando com <code class="inline">ffmpeg version</code>, deu certo.
        Se disser que o comando não foi encontrado, a instalação não terminou ou o PATH não foi atualizado.
      </p>
    </section>

    <!-- Perguntas -->
    <section class="faq">
      <details class="card">
        <summary>Instalei, o terminal acha, mas o app continua dizendo que não</summary>
        <p>
          É quase sempre o PATH. Um programa lê o PATH quando abre — o Mediacript que está aberto agora
          ainda tem a lista antiga. Feche completamente e abra de novo. No macOS, apps abertos pelo Finder
          podem não enxergar o /opt/homebrew/bin; abrir uma vez pelo terminal com
          <code class="inline">open -a Mediacript</code> resolve.
        </p>
      </details>

      <details class="card">
        <summary>Preciso pagar alguma coisa?</summary>
        <p>
          Não. O FFmpeg é software livre. O que pode custar são as APIs de transcrição e de IA (Groq,
          OpenAI e companhia), configuradas em Settings — e essas são contas suas, cobradas direto por eles.
        </p>
      </details>

      <details class="card">
        <summary>O Mediacript manda meus vídeos pra algum lugar?</summary>
        <p>
          O corte, a conversão e a compressão acontecem aqui na sua máquina, via FFmpeg. O que sai daqui é
          só o áudio enviado para transcrever e o texto da transcrição enviado para a IA escolher os
          trechos — e só quando você usa esses recursos.
        </p>
      </details>

      <details class="card">
        <summary>Onde baixo direto do site oficial?</summary>
        <p>
          Em <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer">ffmpeg.org/download.html</a>.
          No Windows, os builds do <a href="https://www.gyan.dev/ffmpeg/builds/" target="_blank" rel="noreferrer">gyan.dev</a>
          são os mais usados. O link abre no seu navegador.
        </p>
      </details>
    </section>
  </div>
</template>

<style scoped>
.help {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.help-head h2 {
  font-size: 20px;
  margin: 0 0 6px;
}

.lead {
  margin: 0;
  color: var(--text-muted);
  font-size: 13.5px;
  line-height: 1.55;
}

/* --- Status -------------------------------------------------------------- */

.status {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-left-width: 4px;
  border-left-style: solid;
}

.status.ok {
  border-left-color: var(--success);
}

.status.missing {
  border-left-color: var(--warning);
}

.status.celebrate {
  animation: status-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes status-pop {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
  }
}

.status-icon {
  font-size: 26px;
}

.status-text {
  flex: 1;
  min-width: 0;
}

.status-title {
  font-weight: 700;
  font-size: 14px;
}

.status-detail {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted);
  overflow-wrap: anywhere;
  /* The version string is worth being able to select and paste into a bug report. */
  user-select: text;
}

.celebrate-note,
.retry-note {
  margin: -8px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.celebrate-note {
  color: var(--success);
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

/* --- Passos -------------------------------------------------------------- */

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  opacity: 0.6;
  transition: opacity 0.2s ease, border-color 0.2s ease;
}

.step.active {
  opacity: 1;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}

.step.done {
  opacity: 0.85;
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
}

.step-n {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  background: var(--border);
  color: var(--text);
}

.step.active .step-n {
  background: var(--accent);
  color: var(--accent-contrast);
}

.step.done .step-n {
  background: var(--success);
  color: #fff;
}

.step-label {
  font-weight: 700;
  font-size: 13px;
}

.step-detail {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.45;
  margin-top: 2px;
}

/* --- Abas de sistema ----------------------------------------------------- */

.os-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.os-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  transition: transform 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.os-tab:hover {
  transform: translateY(-2px);
  color: var(--text);
}

.os-tab.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-elevated));
  color: var(--text);
}

.os-icon {
  font-size: 15px;
}

.os-detected {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

.os-body {
  padding: 16px;
}

.recipe-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recipe-head h3 {
  margin: 0;
  font-size: 15px;
}

.recommended {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
}

.recipe-note {
  margin: 6px 0 12px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.command {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  margin-bottom: 8px;
}

.command code {
  flex: 1;
  font-size: 12.5px;
  font-family: 'Cascadia Code', Consolas, 'SF Mono', Menlo, monospace;
  overflow-x: auto;
  white-space: nowrap;
  /* Commands exist to be copied — by the button or by hand. */
  user-select: text;
}

.copy {
  flex-shrink: 0;
  font-size: 11px;
  padding: 5px 10px;
  color: var(--accent);
}

.gotcha {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text);
}

.toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--accent);
  padding: 6px 0;
}

.chevron {
  display: inline-block;
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.alternatives {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.alt-name {
  font-weight: 700;
  font-size: 13px;
}

.alt-note {
  margin: 3px 0 8px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

/* --- Verificar / FAQ ----------------------------------------------------- */

.verify {
  padding: 16px;
}

.verify h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.verify-note {
  margin: 8px 0;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.55;
}

code.inline {
  font-family: 'Cascadia Code', Consolas, 'SF Mono', Menlo, monospace;
  font-size: 11.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg);
  border: 1px solid var(--border);
  user-select: text;
}

.faq {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.faq details {
  padding: 12px 14px;
}

.faq summary {
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

.faq summary::-webkit-details-marker {
  display: none;
}

.faq summary::before {
  content: '›';
  display: inline-block;
  margin-right: 8px;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.faq details[open] summary::before {
  transform: rotate(90deg);
}

.faq p {
  margin: 10px 0 0 18px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.faq a {
  color: var(--accent);
}

@media (max-width: 700px) {
  .steps {
    grid-template-columns: 1fr;
  }

  .os-tabs {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status.celebrate {
    animation: none;
  }

  .os-tab,
  .step,
  .chevron {
    transition: none;
  }
}
</style>
