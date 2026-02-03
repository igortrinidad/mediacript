# FFmpeg Simple Converter

CLI poderoso e flexível para converter vídeos/áudios e transcrever com IA, funcionando em Linux, Mac e Windows.

## 🌟 Características

- ✅ **Multi-plataforma**: Funciona em Linux, macOS e Windows
- 🔄 **Workflow Multi-Step**: Combine múltiplas operações em um único fluxo
- 🎙️ **Transcrição com IA**: Suporte para Groq (rápido) e OpenAI Whisper
- 💾 **Gerenciamento de Estado**: Salva o progresso de cada etapa do workflow
- 🔑 **Configuração Persistente**: API keys salvas localmente de forma segura
- 📊 **Progresso Visual**: Acompanhe cada etapa do processo

## 📋 Requisitos

- **Node.js** `>= 16`
- **FFmpeg** instalado e disponível no PATH

### Instalando o FFmpeg

#### Windows
```bash
# Com Chocolatey
choco install ffmpeg

# Com Scoop
scoop install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg

# Arch Linux
sudo pacman -S ffmpeg
```

Verifique a instalação:
```bash
ffmpeg -version
```

## 🚀 Instalação

```bash
npm install
```

## 💡 Uso

### Modo Interativo (Recomendado)

```bash
npm start
```

O CLI irá:
1. ✅ Verificar se o FFmpeg está instalado
2. 🔑 Solicitar API keys na primeira execução (opcional)
3. 📁 Listar arquivos de mídia no diretório atual
4. 🎯 Permitir que você escolha o workflow desejado

### Workflows Disponíveis

#### Para Vídeos 🎬
- **Converter vídeo + Extrair áudio + Transcrever**: Pipeline completo
- **Extrair áudio do vídeo + Transcrever**: Para transcrever vídeos
- **Apenas converter vídeo**: Otimiza vídeo (H.264/AAC)
- **Apenas extrair áudio do vídeo**: Extrai áudio em MP3

#### Para Áudios 🎵
- **Converter áudio + Transcrever**: Converte e transcreve
- **Apenas transcrever áudio**: Transcrição direta
- **Apenas converter áudio**: Converte para MP3

## 🔑 Configuração de API Keys

### Primeira Execução

Na primeira vez que executar, você será perguntado se deseja configurar suas API keys:

```
⚠️  Nenhuma API key encontrada.
? Deseja configurar suas API keys agora? (Y/n)

🔑 Configure suas API keys (opcional - pressione Enter para pular)

? Groq API Key (recomendado - mais rápido): sk-proj-...
? OpenAI API Key: sk-...
```

### Onde as Chaves São Salvas

- **Linux/Mac**: `~/.config/ffmpeg-simple-converter/config.json`
- **Windows**: `%APPDATA%/ffmpeg-simple-converter/config.json`

### Obtendo API Keys

#### Groq (Recomendado - Mais Rápido e Barato)
1. Acesse: https://console.groq.com
2. Crie uma conta gratuita
3. Gere uma API key em "API Keys"

#### OpenAI
1. Acesse: https://platform.openai.com
2. Crie uma conta
3. Adicione créditos
4. Gere uma API key em "API Keys"

### Prioridade de Transcrição

O sistema tenta automaticamente na seguinte ordem:
1. **Groq** (se configurado) - mais rápido e barato
2. **OpenAI** (fallback) - se Groq falhar ou não estiver configurado

## 📊 Exemplo de Uso

```bash
$ npm start

🎬 FFmpeg Simple Converter - Workflow Multi-Step

✓ FFmpeg está instalado (versão: 6.0)

📁 Encontrados 3 arquivo(s) de mídia

? Selecione o arquivo:
  🎬 video_aula.mp4
❯ 🎵 podcast.mp3
  🎬 apresentacao.mkv

? Selecione o que deseja fazer:
❯ 🎬 Converter vídeo + Extrair áudio + Transcrever
  🎬 Extrair áudio do vídeo + Transcrever
  🎵 Converter áudio + Transcrever
  🎙️  Apenas transcrever áudio

🚀 Iniciando workflow: Converter vídeo + Extrair áudio + Transcrever
📁 Arquivo de entrada: video_aula.mp4

[1/3] Converter vídeo...
🎬 Convertendo vídeo para formato performático...
✓ Vídeo convertido: video_aula_converted.mp4

[2/3] Extrair áudio...
🎵 Extraindo áudio do vídeo...
✓ Áudio extraído: video_aula_converted_audio.mp3

[3/3] Transcrever áudio...
🎙️  Transcrevendo: video_aula_converted_audio.mp3
📡 Tentando Groq Whisper (rápido)...
✓ Transcrição concluída com Groq
✓ Transcrição salva: video_aula_converted_audio.txt

📊 Progresso do Workflow:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ 1. Converter vídeo (12.3s)
✓ 2. Extrair áudio (3.1s)
✓ 3. Transcrever áudio (8.7s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Arquivos gerados:
  • Vídeo: video_aula_converted.mp4
  • Áudio: video_aula_converted_audio.mp3
  • Transcrição: video_aula_converted_audio.txt
```

## 🗂️ Estrutura do Projeto

```
src/
├── config/          # Gerenciamento de configurações e API keys
├── transcript/      # Módulos de transcrição (Groq e OpenAI)
├── types/           # Definições TypeScript
├── utils/           # Utilitários (ffmpeg, arquivos, etc)
├── workflow/        # Sistema de gerenciamento de workflow
└── index.ts         # CLI principal
```

## 🔧 Scripts Disponíveis

```bash
npm start           # Executa o CLI interativo
npm run build       # Compila TypeScript para JavaScript
npm run dev         # Modo desenvolvimento com watch
npm run convert     # Executa o conversor antigo (convert.js)
```

## 📦 Formatos Suportados

### Áudio
`.ogg`, `.wav`, `.mp3`, `.m4a`, `.aac`, `.flac`

### Vídeo
`.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`

## 🛠️ Gerenciamento de Estado

Cada workflow salva seu estado em `.workflow-state.json` no diretório de saída:

```json
{
  "steps": [
    {
      "id": "step-0",
      "name": "Converter vídeo",
      "status": "completed",
      "startTime": 1675436400000,
      "endTime": 1675436412300
    }
  ],
  "intermediateFiles": {
    "convertedVideo": "video_converted.mp4",
    "extractedAudio": "video_audio.mp3",
    "transcriptionText": "video_audio.txt"
  }
}
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se livre para abrir issues e pull requests.

## 📄 Licença

MIT

## 🙏 Agradecimentos

- FFmpeg pela ferramenta incrível
- OpenAI e Groq pelos serviços de transcrição
