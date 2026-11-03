import path from 'path'
import fs from 'fs'
import { Config, TranscriptSegment, TranscriptWord, TranscriptionRequestOptions } from '../types/index.js'
import { groqTranscriptAudio } from './groq.js'
import { openaiTranscriptAudio } from './openai.js'
import { getFileSize, bytesToMB } from '../utils/fileHelpers.js'
import { splitAudioIntoChunks, deleteDirectory, getAudioDuration } from '../utils/ffmpegOperations.js'

/** Largest audio file sent to a provider in a single request; bigger files are split into chunks */
export const MAX_FILE_SIZE_MB = 10

export interface TranscriptionWithSegments {
  text: string
  segments: TranscriptSegment[]
  /** Only present when word timestamps were requested */
  words?: TranscriptWord[]
  language?: string
}

export interface TranscriptionProvider {
  name: string
  transcribe: (audioFilePath: string) => Promise<TranscriptionWithSegments | null>
}

/**
 * Builds the ordered list of configured transcription providers (Groq first —
 * faster and cheaper — then OpenAI). Only providers with an API key configured
 * are included.
 */
export function getAvailableProviders(config: Config, options?: TranscriptionRequestOptions): TranscriptionProvider[] {
  const providers: TranscriptionProvider[] = []

  if (config.groqApiKey) {
    providers.push({ name: 'Groq', transcribe: (audioFilePath) => groqTranscriptAudio(audioFilePath, config.groqApiKey!, undefined, options) })
  }

  if (config.openaiApiKey) {
    providers.push({ name: 'OpenAI', transcribe: (audioFilePath) => openaiTranscriptAudio(audioFilePath, config.openaiApiKey!, options) })
  }

  return providers
}

/**
 * Transcribes a single audio file, trying each configured provider exactly
 * once, in order, moving on to the next as soon as one fails — until one
 * succeeds or every option has been exhausted.
 */
export async function transcribeSingleAudio(
  audioFilePath: string,
  providers: TranscriptionProvider[]
): Promise<TranscriptionWithSegments | null> {
  for (const provider of providers) {
    console.log(`📡 Trying ${provider.name} Whisper...`)
    const result = await provider.transcribe(audioFilePath)
    if (result) {
      console.log(`✓ Transcription completed with ${provider.name}`)
      return result
    }
    console.log(`⚠️  Failed with ${provider.name}, trying next provider...`)
  }

  return null
}

/**
 * Transcribes an audio file, automatically splitting if larger than 10MB
 * Returns both the plain text and the segment-level timeline (with timestamps
 * rebased to the original file when the audio had to be split into chunks).
 * @param audioFilePath - Audio file path
 * @param config - Configuration with API keys
 * @returns Transcribed text and segments, or null
 */
export async function transcribeAudioWithSegments(
  audioFilePath: string,
  config: Config
): Promise<TranscriptionWithSegments | null> {

  console.log(`\n🎙️  Transcribing: ${path.basename(audioFilePath)}`)

  const providers = getAvailableProviders(config)
  if (providers.length === 0) {
    console.error('❌ No transcription provider configured (Groq/OpenAI)')
    return null
  }

  const fileSize = getFileSize(audioFilePath)
  const fileSizeMB = bytesToMB(fileSize)

  console.log(`📦 File size: ${fileSizeMB.toFixed(2)}MB`)

  // If file is small enough, transcribe directly
  if (fileSizeMB <= MAX_FILE_SIZE_MB) {
    console.log('📡 File size is within limits, transcribing directly...')

    const result = await transcribeSingleAudio(audioFilePath, providers)
    if (!result) {
      console.error('❌ Failed to transcribe with all available services')
    }
    return result
  }

  // File is too large, split into chunks
  console.log(`⚠️  File exceeds ${MAX_FILE_SIZE_MB}MB limit, splitting into chunks...`)

  let chunkFiles: string[] = []
  let tempDir: string = ''

  try {
    chunkFiles = await splitAudioIntoChunks(audioFilePath, MAX_FILE_SIZE_MB)
    tempDir = path.dirname(chunkFiles[0])

    const textParts: string[] = []
    const allSegments: TranscriptSegment[] = []
    let timeOffset = 0

    // Transcribe each chunk
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkFile = chunkFiles[i]
      const chunkSize = bytesToMB(getFileSize(chunkFile))

      console.log(`\n[${i + 1}/${chunkFiles.length}] Transcribing chunk: ${path.basename(chunkFile)} (${chunkSize.toFixed(2)}MB)`)

      const chunkResult = await transcribeSingleAudio(chunkFile, providers)

      if (!chunkResult) {
        // If we couldn't transcribe this chunk with any provider, fail
        console.error(`❌ Failed to transcribe chunk ${i + 1} with all available services`)
        return null
      }

      textParts.push(chunkResult.text)
      for (const segment of chunkResult.segments) {
        allSegments.push({
          start: segment.start + timeOffset,
          end: segment.end + timeOffset,
          text: segment.text
        })
      }

      // Rebase the next chunk's timestamps using this chunk's real duration
      timeOffset += await getAudioDuration(chunkFile)
    }

    // Combine all transcriptions
    console.log('\n🔗 Combining all transcriptions...')
    const finalTranscription = textParts.join('\n\n')
    console.log(`✓ Successfully transcribed all ${chunkFiles.length} chunks`)

    return { text: finalTranscription, segments: allSegments }

  } finally {
    // Clean up temp directory
    if (tempDir) {
      console.log('\n🧹 Cleaning up temporary files...')
      deleteDirectory(tempDir)
      console.log('✓ Cleanup complete')
    }
  }
}

/**
 * Transcribes an audio file, automatically splitting if larger than 10MB
 * @param audioFilePath - Audio file path
 * @param config - Configuration with API keys
 * @returns Transcribed text or null
 */
export async function transcribeAudio(
  audioFilePath: string,
  config: Config
): Promise<string | null> {
  const result = await transcribeAudioWithSegments(audioFilePath, config)
  return result?.text ?? null
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

