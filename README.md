<p align="center">
  <img src="./branding/logo-icon.svg" width="96" alt="Mediacript" />
</p>

<h1 align="center">Mediacript</h1>

<p align="center">
  Converta, comprima, transcreva, legende e corte vídeos e áudios com IA —
  por um <strong>app desktop</strong> ou por uma <strong>CLI/biblioteca Node.js</strong>.
</p>

---

Este repositório é um monorepo com dois produtos que compartilham o mesmo motor:

| Pacote | O que é | Para quem |
| --- | --- | --- |
| **[`packages/cli`](./packages/cli)** — `mediacript` | CLI interativa + biblioteca Node.js (TypeScript). É onde vivem as primitivas: FFmpeg, transcrição (Groq/OpenAI Whisper), providers de LLM, legendas `.srt`, seleção de destaques. [Publicada no npm](https://www.npmjs.com/package/mediacript). | Quem vive no terminal ou quer automatizar isso dentro de outra aplicação. |
| **[`packages/desktop`](./packages/desktop)** — Mediacript Desktop | App Electron + Vue 3 que consome a biblioteca acima e adiciona gravação de reuniões, screencast, chat com IA e histórico. Distribuído como `.exe`/`.dmg` nas [Releases](https://github.com/igortrinidad/mediacript/releases). | Quem não usa terminal — arrasta o arquivo e pronto. |

Os dois leem e escrevem o **mesmo `config.json`** (API keys, pasta de saída padrão), então
configurar em um já vale para o outro.

## 🗂️ Estrutura do repositório

```
mediacript/
├── packages/
│   ├── cli/            # pacote npm "mediacript" — CLI + biblioteca
│   │   ├── src/        # código-fonte TypeScript (ai, transcript, highlights, subtitles, utils, workflow)
│   │   ├── tests/      # suíte Jest
│   │   ├── examples/   # exemplos de uso como biblioteca
│   │   └── scripts/    # install-mac (publicado) + smoke tests do build
│   └── desktop/        # app Electron "Mediacript Desktop"
│       ├── src/main/       # processo principal: janelas, IPC, orquestração dos jobs
│       ├── src/preload/    # contextBridge (window.api)
│       ├── src/renderer/   # app Vue 3 (módulos da bottom nav)
│       ├── src/shared/     # tipos e catálogos compartilhados entre os 3 processos
│       └── scripts/        # preparação do empacotamento (electron-builder)
├── util/               # scripts do repositório como um todo (ex.: sync de versão)
├── branding/           # logos
└── .github/workflows/  # release automático (bump → tag → build → GitHub Release)
```

Cada pacote tem seu próprio `package.json`, `package-lock.json` e `node_modules` — não há
workspaces do npm de propósito: o `electron-builder` percorre o `node_modules` do desktop para
decidir o que empacotar, e o hoisting de workspaces quebraria esse cálculo. O desktop consome a
CLI como dependência local (`"mediacript": "file:../cli"`).

## ✨ O que dá pra fazer

### No app desktop

A navegação é uma bottom nav com um módulo por tarefa:

| Módulo | O que faz |
| --- | --- |
| 💬 **Chat** | Transcreve o vídeo e abre uma conversa com a IA para escolherem juntos os melhores trechos — você refina em linguagem natural ("mais curtos", "foca na parte de preço") e só então os clipes são cortados. |
| 🤖 **Agents** | Salva agentes reutilizáveis: um objetivo em texto + as opções de export (formato/qualidade). Escolha um agente e ele já entra no chat com o prompt e o preset certos. |
| 🎙️ **Reuniões** | Grava microfone e som do sistema em faixas separadas, transcreve cada lado (marcando `Você` × `Participantes`) e pede para a IA escrever a ata: resumo, decisões, ações com responsáveis e pauta da próxima. |
| 🔄 **Convert** | Wizard de poucos passos para as operações clássicas (converter, extrair áudio, transcrever, legendar, cortar destaques) com progresso por etapa. |
| 📦 **Comprimir** | Comprime vídeo para um tamanho-alvo em MB (com preset de velocidade, altura máxima e áudio mono opcionais). |
| 🎥 **Screencast** | Grava a tela com microfone e uma bolha de câmera opcional (canto e formato configuráveis), controlada por uma janelinha flutuante. |
| 📝 **Legendas** | Gera `.srt` com timeline e, se quiser, aplica no vídeo — embutida (hardsub) ou como faixa que liga/desliga (softsub). |
| 🕐 **History** | Tudo que já rodou, com atalho para abrir o arquivo gerado ou mostrar na pasta, além das conversas de chat salvas. |
| ⚙️ **Settings** | API keys (Groq, OpenAI, Anthropic, Gemini, OpenRouter), IA de fallback e pasta de saída padrão. |

**Operações disponíveis no wizard:**

| Vídeo | Áudio |
| --- | --- |
| Converter vídeo + Extrair áudio + Transcrever | Converter áudio + Transcrever |
| Extrair áudio do vídeo + Transcrever | Transcrever áudio |
| Converter vídeo (H.264/AAC) | Converter áudio (MP3) |
| Extrair áudio do vídeo | Gerar legendas (.srt) com timeline |
| Gerar legendas (.srt) com timeline | |
| Aplicar legendas ao vídeo (hardsub/softsub) | |
| Gerar cortes com IA (highlights) | |
| Escolher melhores trechos conversando com a IA | |

**Formatos de export dos clipes:** 16:9, 9:16, 1:1, Instagram Reels, Meta Ads, TikTok, YouTube e
YouTube Shorts — cada um com preset de qualidade (rascunho, padrão, alta ou igual ao original).

### Na CLI / biblioteca

```bash
npx mediacript                 # CLI interativa: escolhe o arquivo e o workflow
```

```javascript
import { processVideo, transcribeAudioFile } from 'mediacript'

const result = await processVideo('video.mp4')
console.log(result.transcription.text)
```

Detalhes completos em **[packages/cli/README.md](./packages/cli/README.md)**,
**[LIBRARY_USAGE.md](./packages/cli/LIBRARY_USAGE.md)** e
**[examples/](./packages/cli/examples/)**.

## 📋 Requisitos

- **Node.js** `>= 18` para usar (o desenvolvimento e o CI usam a versão fixada no [`.nvmrc`](./.nvmrc))
- **FFmpeg** instalado e no PATH — `choco install ffmpeg` (Windows), `brew install ffmpeg` (macOS),
  `sudo apt install ffmpeg` (Linux). Confirme com `ffmpeg -version`.
- Pelo menos uma API key de transcrição ([Groq](https://console.groq.com) é mais rápida e barata;
  [OpenAI](https://platform.openai.com) funciona como fallback). Para os recursos de IA (cortes,
  chat, ata de reunião) você também pode usar Anthropic, Gemini ou OpenRouter.

## 🚀 Começando

```bash
git clone https://github.com/igortrinidad/mediacript.git
cd mediacript
npm run setup          # instala as dependências dos dois pacotes
```

A partir da raiz:

| Comando | O que faz |
| --- | --- |
| `npm run desktop` | Sobe o app desktop em modo dev (recompila a CLI antes) |
| `npm run desktop:build` | Compila main/preload/renderer para `packages/desktop/out` |
| `npm run desktop:typecheck` | Typecheck do processo principal + renderer |
| `npm run package:win` / `:mac` / `:linux` | Gera o instalador da plataforma em `packages/desktop/release` |
| `npm run cli` | Roda a CLI interativa a partir do código-fonte |
| `npm run cli:build` | Compila a biblioteca para `packages/cli/dist` (ESM + CJS) |
| `npm run cli:test` | Suíte Jest da CLI |
| `npm run version:sync` | Aplica a versão da raiz em todos os `packages/*` |

Você também pode trabalhar dentro de um pacote específico (`cd packages/desktop && npm run dev`) —
cada um documenta seus próprios scripts no README.

## 🔑 Configuração compartilhada

API keys e preferências ficam em um único arquivo, usado por CLI e desktop:

- **Linux/macOS**: `~/.config/ffmpeg-simple-converter/config.json`
- **Windows**: `%APPDATA%/ffmpeg-simple-converter/config.json`

A transcrição tenta **Groq** primeiro (mais rápido e barato) e cai para **OpenAI** se falhar ou não
estiver configurada.

### macOS: instalar / app "danificado" ao abrir o `.dmg`

O `.dmg` não é assinado/notarizado, então o Gatekeeper coloca o app em quarentena. Basta rodar:

```bash
npx mediacript install-mac
```

O comando consulta a última release no GitHub, baixa o `.dmg` para `~/Downloads` se ainda não
estiver lá (ou se o que estiver lá for mais antigo), monta o DMG, instala em `/Applications`,
remove a quarentena e abre o app. Sem internet, ele usa o `Mediacript*.dmg` que já estiver em
`~/Downloads`. Também serve para atualizar: rode de novo quando sair uma versão nova.

## 📦 Release

Todo push na `main` dispara o [workflow de release](./.github/workflows/release-desktop.yml), que:

1. Faz o bump de patch no `package.json` da **raiz** (fonte da verdade da versão do produto);
2. Propaga essa versão para todos os `packages/*` com [`util/sync-version.mjs`](./util/sync-version.mjs);
3. Commita com `[skip ci]`, cria a tag `vX.Y.Z`;
4. Builda os instaladores Windows e macOS e publica na GitHub Release.

## 🤝 Contribuindo

Issues e PRs são bem-vindos. Antes de abrir um PR, rode `npm run cli:test` e
`npm run desktop:typecheck`.

## 📄 Licença

MIT
