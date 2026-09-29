# MediaScript - Uso como Biblioteca

O MediaScript pode ser usado tanto como CLI quanto como biblioteca em suas aplicações Node.js.

## Instalação

```bash
npm install mediacript
```

ou

```bash
yarn add mediacript
```

## Requisitos

- Node.js >= 16
- FFmpeg instalado no sistema
- Chave de API do Groq ou OpenAI (para transcrição)

## Configuração

### Via arquivo .env

Crie um arquivo `.env` na raiz do seu projeto:

```env
GROQ_API_KEY=sua-chave-groq
OPENAI_API_KEY=sua-chave-openai
```

### Via código (passando API keys diretamente)

Você pode passar as API keys diretamente ao chamar as funções:

```javascript
import { transcribeAudioFile } from 'mediacript'

const result = await transcribeAudioFile('audio.mp3', {
  groqApiKey: 'sua-chave-groq',
  openaiApiKey: 'sua-chave-openai'
})
```

## Uso Básico

**Importante:** Todas as funções aceitam tanto **caminhos relativos** quanto **caminhos absolutos**:

```javascript
// Caminhos relativos
await convertVideoFile('./video.mov')
await convertVideoFile('videos/video.mov')

// Caminhos absolutos
await convertVideoFile('/home/user/videos/video.mov')
await convertVideoFile('/Users/user/Documents/video.mov')
await convertVideoFile('C:\\Users\\user\\Videos\\video.mov')
```

### 1. Inicialização (verificar dependências)

```javascript
import { initialize } from 'mediacript'

try {
  await initialize()
  console.log('MediaScript inicializado com sucesso!')
} catch (error) {
  console.error('FFmpeg não encontrado:', error)
}
```

### 2. Converter Vídeo

```javascript
import { convertVideoFile } from 'mediacript'

// Caminho relativo
const result = await convertVideoFile('./videos/video.mov')
console.log('Vídeo convertido:', result.outputPath)

// Caminho absoluto
const result2 = await convertVideoFile('/home/user/videos/video.mov', '/home/user/output')
console.log('Vídeo convertido:', result2.outputPath)

// ⚡ CONVERSÃO RÁPIDA para arquivos grandes (WebM, etc)
const result3 = await convertVideoFile('./video-grande.webm', './output', {
  preset: 'veryfast',  // Muito mais rápido que 'medium' (padrão)
  crf: 25,             // Qualidade um pouco menor = mais rápido
  hwaccel: 'auto'      // Usa GPU se disponível (MUITO mais rápido)
})
```

**Presets disponíveis** (do mais rápido ao mais lento):
- `ultrafast` - Mais rápido, qualidade mais baixa
- `superfast` - Muito rápido
- `veryfast` - Rápido ⭐ **Recomendado para arquivos grandes**
- `faster` - Mais rápido
- `fast` - Rápido
- `medium` - Balanceado (padrão)
- `slow` - Lento, melhor qualidade
- `slower` - Muito lento
- `veryslow` - Mais lento, máxima qualidade

**Hardware Acceleration** (acelera muito a conversão):
- `auto` - Auto-detecta GPU disponível ⭐ **Recomendado**
- `nvenc` - NVIDIA GPU (até 10x mais rápido)
- `qsv` - Intel Quick Sync
- `vaapi` - Intel/AMD no Linux
- `none` - Sem aceleração (CPU apenas)

### 3. Extrair Áudio de Vídeo

```javascript
import { extractAudioFromVideo } from 'mediacript'

// Com caminho completo
const result = await extractAudioFromVideo('/path/completo/para/video.mp4')
console.log('Áudio extraído:', result.outputPath)

// Especificando diretório de saída
const result2 = await extractAudioFromVideo(
  '/path/completo/para/video.mp4',
  '/path/completo/para/output'
)
```

### 4. Converter Áudio

```javascript
import { convertAudioFile } from 'mediacript'

const result = await convertAudioFile('/home/user/audio.wav')
console.log('Áudio convertido:', result.outputPath)
```

### 5. Transcrever Áudio

```javascript
import { transcribeAudioFile } from 'mediacript'

// Aceita path completo
const result = await transcribeAudioFile('/absolute/path/to/audio.mp3')
if (result) {
  console.log('Transcrição:', result.text)
  console.log('Duração:', result.duration, 'segundos')
}

// Ou path relativo
const result2 = await transcribeAudioFile('./audio.mp3')
```

### 6. Salvar Transcrição em Arquivo

```javascript
import { saveTranscriptionToFile } from 'mediacript'

const filePath = await saveTranscriptionToFile(
  'Texto da transcrição aqui...',
  'audio.mp3'
)
console.log('Transcrição salva em:', filePath)
```

### 7. Gerar Legendas com Timeline (.srt)

Transcreve o áudio e já gera um arquivo `.srt` com a timeline completa (cada trecho com seu
`start`/`end` em segundos):

```javascript
import { generateSubtitles } from 'mediacript'

const subtitles = await generateSubtitles('audio.mp3')
if (subtitles) {
  console.log('Legendas salvas em:', subtitles.srtPath)
  console.log('Segmentos:', subtitles.segments) // [{ start, end, text }, ...]
}
```

### 8. Selecionar Destaques com IA e Gerar Cortes

Depois de ter os `segments` (por exemplo, vindos de `generateSubtitles`), você pode pedir para um LLM
escolher os melhores trechos com base em um prompt livre, e depois cortar um clipe por destaque:

```javascript
import { generateSubtitles, extractVideoHighlights, cutHighlightClips } from 'mediacript'

const subtitles = await generateSubtitles('video_audio.mp3')

const highlights = await extractVideoHighlights(
  subtitles.segments,
  'os 3 melhores momentos de humor da entrevista',
  {
    provider: 'anthropic', // 'anthropic' | 'gemini' | 'openrouter'
    model: 'claude-sonnet-5-5',
    apiKey: process.env.ANTHROPIC_API_KEY
  }
)

console.log('Destaques escolhidos pela IA:', highlights) // [{ start, end, title, reason }, ...]

const clips = await cutHighlightClips('video.mp4', highlights, './output')
console.log('Clipes gerados:', clips.map((clip) => clip.outputPath))
```

Ou use o workflow completo em uma única chamada (extrai áudio → transcreve → pede destaques → corta os clipes):

```javascript
import { extractHighlightClips } from 'mediacript'

const result = await extractHighlightClips(
  'video.mp4',
  'os 3 melhores momentos de humor da entrevista',
  {
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    apiKey: process.env.GEMINI_API_KEY
  },
  { outputDir: './output' }
)

console.log('Legendas:', result.subtitles.srtPath)
console.log('Destaques:', result.highlights)
console.log('Clipes:', result.clips.map((clip) => clip.outputPath))
```

**Provedores e modelos suportados:**

```javascript
import { AI_MODELS_BY_PROVIDER, AI_PROVIDER_LABELS } from 'mediacript'

console.log(AI_MODELS_BY_PROVIDER)
// {
//   anthropic: ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-4-8', 'claude-sonnet-5', ...],
//   gemini: ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-pro', ...],
//   openrouter: ['anthropic/claude-sonnet-5.5', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash', ...],
//   openai: ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
//   groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', ...]
// }
```

Essas listas são apenas sugestões — qualquer id de modelo válido para o provedor escolhido também
funciona (na CLI interativa isso aparece como a opção "Outro (digitar manualmente)").

Ao usar `provider: 'openai'` ou `provider: 'groq'` para escolher os destaques, você pode passar a
**mesma API key** já usada para transcrição (`process.env.OPENAI_API_KEY` / `process.env.GROQ_API_KEY`)
— não é uma conta separada.

## Workflows Completos

### Processar Vídeo Completo (Converter + Extrair Áudio + Transcrever)

```javascript
import { processVideo } from 'mediacript'

// Com caminho completo do arquivo e diretório de saída
const result = await processVideo(
  '/home/user/videos/video.mov',
  '/home/user/output'
)

console.log('Vídeo convertido:', result.convertedVideo.outputPath)
console.log('Áudio extraído:', result.extractedAudio.outputPath)

if (result.transcription) {
  console.log('Transcrição:', result.transcription.text)
}

// Ou usando caminhos relativos
const result2 = await processVideo('./video.mov', './output')

// ⚡ CONVERSÃO RÁPIDA para vídeos grandes
const result3 = await processVideo(
  './video-grande.webm',
  './output',
  {
    conversionOptions: {
      preset: 'veryfast',
      hwaccel: 'auto'
    },
    groqApiKey: process.env.GROQ_API_KEY
  }
)
```

### Extrair e Transcrever (sem conversão de vídeo)

```javascript
import { extractAndTranscribe } from 'mediacript'

const result = await extractAndTranscribe('video.mp4')

console.log('Áudio extraído:', result.extractedAudio.outputPath)

if (result.transcription) {
  console.log('Transcrição:', result.transcription.text)
}
```

### Converter e Transcrever Áudio

```javascript
import { convertAndTranscribe } from 'mediacript'

const result = await convertAndTranscribe('audio.wav')

console.log('Áudio convertido:', result.convertedAudio.outputPath)

if (result.transcription) {
  console.log('Transcrição:', result.transcription.text)
}
```

## Funções Utilitárias

### Detectar Tipo de Arquivo

```javascript
import { detectMediaFileType } from 'mediacript'

const type = detectMediaFileType('arquivo.mp4')
console.log('Tipo:', type) // 'video' ou 'audio'
```

### Listar Arquivos de Mídia em um Diretório

```javascript
import { listMediaFilesInDirectory } from 'mediacript'

const files = await listMediaFilesInDirectory('./videos')
console.log('Arquivos encontrados:', files)
```

### Obter Duração de Áudio

```javascript
import { getAudioFileDuration } from 'mediacript'

const duration = await getAudioFileDuration('audio.mp3')
console.log('Duração:', duration, 'segundos')
```

### Dividir Áudio em Chunks

Útil para arquivos grandes (>10MB são divididos automaticamente na transcrição):

```javascript
import { splitAudioFile } from 'mediacript'

const chunks = await splitAudioFile('audio-grande.mp3', 10) // 10MB por chunk
console.log('Chunks criados:', chunks)
```

## Exemplo Completo com TypeScript

```typescript
import {
  initialize,
  processVideo,
  saveTranscriptionToFile,
  type TranscriptionResult,
  type ConversionResult
} from 'mediacript'

async function processarVideo(caminhoVideo: string): Promise<void> {
  try {
    // Verificar se FFmpeg está instalado
    await initialize()
    
    console.log('Processando vídeo...')
    
    // Executar workflow completo
    const resultado = await processVideo(caminhoVideo, './output', {
      groqApiKey: process.env.GROQ_API_KEY
    })
    
    console.log('✓ Vídeo convertido:', resultado.convertedVideo.outputPath)
    console.log('✓ Áudio extraído:', resultado.extractedAudio.outputPath)
    
    if (resultado.transcription) {
      console.log('✓ Transcrição completa!')
      
      // Salvar transcrição
      const transcriptionFile = await saveTranscriptionToFile(
        resultado.transcription.text,
        resultado.extractedAudio.outputPath
      )
      
      console.log('✓ Transcrição salva em:', transcriptionFile)
      console.log('\nTexto:')
      console.log(resultado.transcription.text)
    }
  } catch (error) {
    console.error('Erro ao processar vídeo:', error)
  }
}

// Executar
processarVideo('./meu-video.mp4')
```

## Exemplo com Express.js

```javascript
import express from 'express'
import multer from 'multer'
import { extractAndTranscribe, saveTranscriptionToFile } from 'mediacript'

const app = express()
const upload = multer({ dest: 'uploads/' })

app.post('/transcribe', upload.single('video'), async (req, res) => {
  try {
    const videoPath = req.file.path
    
    // Extrair áudio e transcrever
    const result = await extractAndTranscribe(videoPath)
    
    if (!result.transcription) {
      return res.status(500).json({ error: 'Falha na transcrição' })
    }
    
    // Salvar transcrição
    const transcriptionFile = await saveTranscriptionToFile(
      result.transcription.text,
      result.extractedAudio.outputPath
    )
    
    res.json({
      audioPath: result.extractedAudio.outputPath,
      transcriptionPath: transcriptionFile,
      text: result.transcription.text,
      duration: result.transcription.duration
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000')
})
```

## Tratamento de Erros

Todas as funções podem lançar erros. Use try/catch:

```javascript
import { convertVideoFile } from 'mediacript'

try {
  const result = await convertVideoFile('video.mov')
  console.log('Sucesso:', result.outputPath)
} catch (error) {
  if (error.message.includes('FFmpeg')) {
    console.error('FFmpeg não está instalado')
  } else if (error.message.includes('not found')) {
    console.error('Arquivo não encontrado')
  } else {
    console.error('Erro:', error.message)
  }
}
```

## API Reference

Veja o arquivo `src/lib.ts` para a definição completa de tipos e funções disponíveis.

### Principais Funções

- `initialize()` - Verifica se FFmpeg está instalado
- `convertVideoFile(path, outputDir?)` - Converte vídeo para H.264/AAC
- `extractAudioFromVideo(path, outputDir?)` - Extrai áudio de vídeo
- `convertAudioFile(path, outputDir?)` - Converte áudio para MP3
- `transcribeAudioFile(path, options?)` - Transcreve áudio (já inclui `segments` com timeline)
- `saveTranscriptionToFile(text, audioPath)` - Salva transcrição em arquivo
- `generateSubtitles(path, options?)` - Transcreve e gera um arquivo `.srt` com a timeline
- `extractVideoHighlights(segments, prompt, aiOptions)` - Pede para uma IA escolher os melhores trechos
- `cutHighlightClips(videoPath, highlights, outputDir?)` - Corta um clipe por destaque
- `extractHighlightClips(videoPath, prompt, aiOptions, options?)` - Workflow completo: extrai áudio, transcreve, pede destaques à IA e corta os clipes
- `processVideo(path, outputDir?, options?)` - Workflow completo
- `extractAndTranscribe(path, outputDir?, options?)` - Extrai e transcreve
- `convertAndTranscribe(path, outputDir?, options?)` - Converte e transcreve

### Tipos

```typescript
interface MediaScriptOptions {
  groqApiKey?: string
  openaiApiKey?: string
}

interface TranscriptionResult {
  text: string
  duration?: number
  filePath: string
  segments?: TranscriptSegment[]
}

interface ConversionResult {
  outputPath: string
  originalPath: string
}

interface TranscriptSegment {
  start: number // segundos
  end: number   // segundos
  text: string
}

interface HighlightSegment {
  start: number // segundos
  end: number   // segundos
  title: string
  reason?: string
}

interface SubtitlesResult {
  srtPath: string
  segments: TranscriptSegment[]
  text: string
}

type AIProviderName = 'anthropic' | 'gemini' | 'openrouter' | 'openai' | 'groq'

interface HighlightAIOptions {
  provider: AIProviderName
  model: string
  apiKey: string
  temperature?: number
  maxTokens?: number
}
```

## Uso da CLI

O MediaScript continua funcionando como CLI:

```bash
# Via CLI interativa
mediacript

# Conversão direta
mediacript-convert video.mov
```

Veja [QUICK_START.md](./QUICK_START.md) para mais detalhes sobre uso da CLI.
