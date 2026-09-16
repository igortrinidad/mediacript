# Mediacript Desktop

Interface gráfica (Electron + Vue 3 + TypeScript) para as funcionalidades da CLI/biblioteca
[`mediacript`](../cli/README.md): converter vídeos/áudios, transcrever, gerar legendas com timeline (.srt)
e cortar destaques com IA — pensada para quem não usa terminal.

Faz parte do [monorepo Mediacript](../../README.md) — veja o README da raiz para a visão geral dos
dois produtos e como rodar cada um.

## Módulos

A navegação é uma bottom nav flutuante, com um módulo por tarefa:

| Módulo | O que faz |
| --- | --- |
| 💬 **Chat** | Transcreve o vídeo e abre uma conversa com a IA para escolherem juntos os melhores trechos, antes de cortar os clipes. |
| 🤖 **Agents** | Agentes reutilizáveis: um objetivo em texto + as opções de export (formato/qualidade) já prontas para o chat. |
| 🎙️ **Reuniões** | Grava microfone + som do sistema, transcreve cada faixa e gera a ata com IA (detalhes abaixo). |
| 🔄 **Convert** | Wizard das operações clássicas: converter, extrair áudio, transcrever, legendar, cortar destaques — com progresso por etapa. |
| 📦 **Comprimir** | Comprime o vídeo mirando um tamanho-alvo em MB (preset de velocidade, altura máxima e áudio mono opcionais). |
| 🎥 **Screencast** | Grava a tela com microfone e bolha de câmera opcional, controlada por uma janelinha flutuante. |
| 📝 **Legendas** | Gera o `.srt` e, se quiser, aplica no vídeo — hardsub (embutida) ou softsub (faixa que liga/desliga). |
| 🕐 **History** | Tudo que já rodou, com atalho para abrir o arquivo ou mostrar na pasta, além das conversas de chat salvas. |
| ⚙️ **Settings** | API keys (Groq/OpenAI/Anthropic/Gemini/OpenRouter), IA de fallback e pasta de saída padrão. |

Em qualquer módulo que receba arquivos você pode arrastar e soltar (ou clicar para selecionar), e
acompanhar o progresso de cada etapa em tempo real.

## Reuniões (ata com IA)

A aba **Reuniões** grava o microfone e o som do computador ao mesmo tempo, transcreve cada lado
separadamente e pede para uma IA escrever a ata (resumo, decisões, ações com responsáveis e pauta da
próxima reunião).

Cada faixa é gravada em um arquivo próprio — é isso que dá a marcação de quem falou (`Você` para o
microfone, `Participantes` para o áudio do sistema). Quando o usuário está sem fone, o microfone
também capta o alto-falante; trechos que se sobrepõem no tempo e dizem quase a mesma coisa são
descartados da faixa do microfone (`mergeTrackSegments` em `main/lib/meetingTranscript.ts`).

O áudio é gravado em blocos de 5 segundos escritos direto em disco (nada fica acumulado em memória),
então uma reunião de duas horas não pesa no app e uma queda no meio não perde o que já foi gravado.

### Captura do som do sistema por plataforma

| Sistema | Como funciona |
| --- | --- |
| Windows | Captura automática (`audio: 'loopback'` do Electron) — nada a instalar. |
| Linux | Escolha um dispositivo `Monitor of ...` do PulseAudio na opção "Dispositivo". |
| macOS | O Electron 33 não expõe loopback aqui: instale um driver virtual (BlackHole, Loopback) e selecione-o como "Dispositivo". |

Gravações e documentos ficam em `Documentos/Mediacript Meetings/<data>_<título>/`
(`mic.webm`/`system.webm` brutos, `.mp3` de transcrição, `transcricao.md` e `ata.md`). Os metadados
da reunião ficam junto do `config.json`, em `meetings/<id>.json`.

As configurações (API keys) são **compartilhadas com a CLI** — ambas leem/escrevem o mesmo
`config.json` em `~/.config/ffmpeg-simple-converter` (ou `%APPDATA%/ffmpeg-simple-converter` no
Windows), então configurar por um dos dois já vale para o outro.

> 🔒 **As chaves ficam apenas no seu computador**, nesse `config.json`, e são enviadas somente para o
> provedor que você configurou (Groq, OpenAI, Anthropic, Google ou OpenRouter). O app não tem servidor
> próprio nem telemetria: nenhuma chave, mídia ou transcrição vai para nós ou para terceiros.

## Requisitos

- Node.js >= 18
- FFmpeg instalado no sistema (o app avisa na tela inicial se não encontrar)
- O pacote `packages/cli` precisa estar compilado (`dist/`) — os scripts abaixo já cuidam disso.

## Instalação (usuários finais — macOS)

O `.dmg` publicado nas [Releases do GitHub](https://github.com/igortrinidad/mediacript/releases) não é
assinado/notarizado, então o Gatekeeper do macOS coloca o app em quarentena ao baixar (aparece
"Mediacript está danificado e não pode ser aberto"). Não precisa baixar nada manualmente — rode:

```bash
npx mediacript install-mac
```

Isso consulta a última release no GitHub, baixa o `.dmg` para `~/Downloads` se não houver um (ou se
o que houver for mais antigo), monta o DMG, instala o app em `/Applications`, remove a quarentena e
já abre o Mediacript (script em [`../cli/scripts/install-mac.mjs`](../cli/scripts/install-mac.mjs)).
Sem internet, ele usa o `Mediacript*.dmg` já presente em `~/Downloads`. Rode de novo para atualizar.
Requer Node.js 18+.

## Desenvolvimento

```bash
cd packages/desktop
npm install
npm run dev
```

`npm run dev` primeiro roda `npm run build` em `packages/cli` (garantindo que `dist/` está atualizado)
e depois inicia o Electron em modo desenvolvimento com hot-reload do renderer.

Se você alterar código em `packages/cli/src/`, rode `npm run dev` de novo
(ou `npm run prepare:lib` sozinho) para que o app desktop enxergue a mudança — ele consome
`mediacript` como uma dependência local (`file:../cli`) apontando para o `dist/` já compilado.

## Verificação de tipos

```bash
npm run typecheck        # main + renderer
npm run typecheck:node   # só o processo principal/preload
npm run typecheck:web    # só o renderer (Vue)
```

## Build / empacotamento

```bash
npm run build            # compila main/preload/renderer para packages/desktop/out (não gera instalador)
npm run package:linux     # gera um AppImage em packages/desktop/release
npm run package:mac       # gera um .dmg (precisa rodar em macOS)
npm run package:win       # gera um instalador NSIS (precisa rodar em Windows, ou com Wine no Linux)
```

Cada `package:*` primeiro roda `prepare:package`, que reconstrói `packages/cli` e troca
`node_modules/mediacript` — normalmente um symlink pra pasta inteira de `packages/cli` (ótimo para dev,
já que reflete mudanças na hora) — por uma cópia limpa contendo só o que `npm pack` publicaria (`dist/`,
`cli.mjs`, `convert.js`, `package.json`). Sem isso, o electron-builder segue o symlink e empacota o
pacote inteiro (node_modules de dev, testes, examples, vídeos de teste...): o instalador ia
de ~110MB para **vários GB**. Depois de empacotar, rode `npm install` de novo em `packages/desktop/` para
restaurar o symlink de desenvolvimento.
## Arquitetura

```
packages/desktop/
├── src/
│   ├── main/            # processo principal do Electron (janelas, IPC, orquestração dos jobs)
│   │   ├── ipc/         # handlers: agents, chat, compress, config, ffmpeg, files, history, jobs, meetings, screencast
│   │   └── lib/         # jobRunner (chama as funções do mediacript) + stores em JSON (history, agents, chat, meetings, screencast)
│   ├── preload/         # contextBridge — expõe `window.api` de forma segura ao renderer
│   ├── renderer/        # app Vue 3
│   │   ├── shell/       # AppShell + BottomNav (a casca que troca de módulo)
│   │   ├── modules/     # um diretório por módulo da bottom nav (chat, agents, meetings, convert, ...)
│   │   ├── composables/ # estado compartilhado entre módulos (settings, history, agents, navegação, ...)
│   │   └── shared/      # componentes e helpers reaproveitados pelos módulos
│   └── shared/          # tipos, catálogo de operações e formatos de export (main + preload + renderer)
```

O processo principal reimplementa a orquestração passo-a-passo do CLI (`executeWorkflow`) chamando
as mesmas funções primitivas exportadas por `mediacript` (`convertVideoFile`, `extractAudioFromVideo`,
`transcribeAudioFile`, `saveSrtFile`, `extractVideoHighlights`, `cutHighlightClips`, ...), emitindo um
evento de progresso por etapa para a interface — em vez de usar as funções de conveniência
(`processVideo`, `extractHighlightClips`, etc.), que rodam tudo de uma vez sem pontos de progresso
intermediários.
