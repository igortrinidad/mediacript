#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { ensureConfig, loadConfig, hasApiKey } from './config.js'
import { verifyFfmpeg } from './ffmpegCheck.js'
import { transcriptAudioUsingOpenAiWhisper } from './transcriptAudioUsingOpenAiWhisper.js'
import { groqTranscriptAudio } from './groqTranscriptAudio.js'

const AUDIO_EXTS = new Set(['.ogg', '.wav', '.mp3', '.m4a', '.aac', '.flac'])

interface TranscriptionService {
  name: string
  value: 'openai' | 'groq'
  available: boolean
}

/**
 * Lista arquivos de áudio no diretório atual
 */
function listAudioFiles(dir: string): Array<{ name: string; fullPath: string }> {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => {
        const fullPath = path.join(dir, name)
        try {
          return fs.statSync(fullPath).isFile()
        } catch {
          return false
        }
      })
      .filter((name) => {
        const ext = path.extname(name).toLowerCase()
        return AUDIO_EXTS.has(ext)
      })
      .map((name) => ({
        name,
        fullPath: path.join(dir, name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Erro ao listar arquivos:', error)
    return []
  }
}

/**
 * Salva a transcrição em arquivo
 */
function saveTranscription(audioPath: string, transcription: string): void {
  const outputFileName = path.basename(audioPath, path.extname(audioPath)) + '.txt'
  const outputPath = path.join(path.dirname(audioPath), outputFileName)
  
  fs.writeFileSync(outputPath, transcription, 'utf-8')
  console.log(`\n✓ Transcrição salva: ${outputPath}`)
}

/**
 * Realiza a transcrição usando o serviço selecionado
 */
async function transcribeAudio(
  audioPath: string,
  service: 'openai' | 'groq',
  config: any
): Promise<string | null> {
  console.log(`\n🎙️  Transcrevendo: ${path.basename(audioPath)}`)
  console.log(`📡 Usando: ${service === 'openai' ? 'OpenAI Whisper' : 'Groq Whisper'}`)
  
  let result: string | null = null
  
  if (service === 'openai' && config.openaiApiKey) {
    result = await transcriptAudioUsingOpenAiWhisper(audioPath, config.openaiApiKey)
  } else if (service === 'groq' && config.groqApiKey) {
    result = await groqTranscriptAudio(audioPath, config.groqApiKey)
  } else {
    console.error('❌ API Key não configurada para o serviço selecionado')
    return null
  }
  
  return result
}

/**
 * Função principal
 */
async function main() {
  console.log('🎬 FFmpeg Simple Converter - Transcrição de Áudio\n')
  
  // Verifica o ffmpeg
  const ffmpegInstalled = verifyFfmpeg()
  if (!ffmpegInstalled) {
    process.exit(1)
  }
  
  console.log('')
  
  // Garante que há configuração
  const config = await ensureConfig()
  
  if (!hasApiKey(config)) {
    console.log('\n⚠️  Nenhuma API key configurada. A transcrição não estará disponível.')
    console.log('Execute novamente e configure uma API key quando solicitado.\n')
    process.exit(1)
  }
  
  // Determina quais serviços estão disponíveis
  const services: TranscriptionService[] = []
  
  if (config.openaiApiKey) {
    services.push({
      name: 'OpenAI Whisper',
      value: 'openai',
      available: true
    })
  }
  
  if (config.groqApiKey) {
    services.push({
      name: 'Groq Whisper (mais rápido)',
      value: 'groq',
      available: true
    })
  }
  
  // Lista arquivos de áudio
  const currentDir = process.cwd()
  const audioFiles = listAudioFiles(currentDir)
  
  if (audioFiles.length === 0) {
    console.log('\n⚠️  Nenhum arquivo de áudio encontrado no diretório atual.')
    console.log('Formatos suportados: .ogg, .wav, .mp3, .m4a, .aac, .flac\n')
    process.exit(0)
  }
  
  console.log(`\n📁 Encontrados ${audioFiles.length} arquivo(s) de áudio\n`)
  
  // Seleção do arquivo
  const { selectedFile } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedFile',
      message: 'Selecione o arquivo de áudio:',
      choices: audioFiles.map((f) => ({
        name: f.name,
        value: f.fullPath
      }))
    }
  ])
  
  // Seleção do serviço (se houver mais de um)
  let selectedService: 'openai' | 'groq' = services[0].value
  
  if (services.length > 1) {
    const { service } = await inquirer.prompt([
      {
        type: 'list',
        name: 'service',
        message: 'Selecione o serviço de transcrição:',
        choices: services.map((s) => ({
          name: s.name,
          value: s.value
        }))
      }
    ])
    selectedService = service
  }
  
  // Realiza a transcrição
  const transcription = await transcribeAudio(selectedFile, selectedService, config)
  
  if (transcription) {
    saveTranscription(selectedFile, transcription)
    console.log('\n✅ Transcrição concluída com sucesso!\n')
  } else {
    console.log('\n❌ Falha ao transcrever o áudio\n')
    process.exit(1)
  }
}

// Executa
main().catch((error) => {
  console.error('\n❌ Erro:', error.message)
  process.exit(1)
})
