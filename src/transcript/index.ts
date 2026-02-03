import path from 'path'
import fs from 'fs'
import { Config } from '../types/index.js'
import { groqTranscriptAudio } from './groq.js'
import { openaiTranscriptAudio } from './openai.js'

/**
 * Transcribes an audio file trying Groq first, then OpenAI
 * @param audioFilePath - Audio file path
 * @param config - Configuration with API keys
 * @returns Transcribed text or null
 */
export async function transcribeAudio(
  audioFilePath: string,
  config: Config
): Promise<string | null> {
  
  console.log(`\n🎙️  Transcribing: ${path.basename(audioFilePath)}`)
  
  // Try Groq first (faster and cheaper)
  if (config.groqApiKey) {
    console.log('📡 Trying Groq Whisper (fast)...')
    const result = await groqTranscriptAudio(audioFilePath, config.groqApiKey)
    if (result) {
      console.log('✓ Transcription completed with Groq')
      return result
    }
    console.log('⚠️  Failed with Groq, trying OpenAI...')
  }
  
  // If Groq failed or is not configured, try OpenAI
  if (config.openaiApiKey) {
    console.log('📡 Trying OpenAI Whisper...')
    const result = await openaiTranscriptAudio(audioFilePath, config.openaiApiKey)
    if (result) {
      console.log('✓ Transcription completed with OpenAI')
      return result
    }
  }
  
  // If we got here, no service worked
  if (!config.groqApiKey && !config.openaiApiKey) {
    console.error('❌ No API key configured for transcription')
  } else {
    console.error('❌ Failed to transcribe with all available services')
  }
  
  return null
}

/**
 * Saves transcription to file
 */
export function saveTranscription(audioPath: string, transcription: string): string {
  const outputFileName = path.basename(audioPath, path.extname(audioPath)) + '.txt'
  const outputPath = path.join(path.dirname(audioPath), outputFileName)
  
  fs.writeFileSync(outputPath, transcription, 'utf-8')
  return outputPath
}
