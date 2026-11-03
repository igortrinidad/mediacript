import fs from 'fs'
import OpenAI from 'openai'
import type { TranscriptSegment, TranscriptWord, TranscriptionRequestOptions } from '../types/index.js'

export interface OpenAITranscriptionResult {
  text: string
  segments: TranscriptSegment[]
  /** Only present when `options.wordTimestamps` was requested */
  words?: TranscriptWord[]
  /** Language reported by the provider, if any */
  language?: string
}

/**
 * Transcribes an audio file using OpenAI Whisper
 * @param audioLocalFilePath - Local audio file path
 * @param apiKey - OpenAI API Key
 * @param options - Optional language, prompt and word-timestamp request
 * @returns Transcribed text with segment-level timestamps, or null in case of error
 */
export const openaiTranscriptAudio = async (
  audioLocalFilePath: string,
  apiKey: string,
  options: TranscriptionRequestOptions = {}
): Promise<OpenAITranscriptionResult | null> => {

  if (!apiKey) {
    console.error('❌ OpenAI API Key not provided')
    return null
  }

  try {
    const openai = new OpenAI({ apiKey })

    const transcription: any = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioLocalFilePath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      ...(options.language ? { language: options.language } : {}),
      ...(options.prompt ? { prompt: options.prompt } : {}),
      ...(options.wordTimestamps ? { timestamp_granularities: ['word', 'segment'] as Array<'word' | 'segment'> } : {})
    })

    const text = (transcription?.text || '').trim()
    // A chunk without speech is a valid result when word timings are wanted (the
    // timeline stays intact); otherwise keep the original "empty = failure" behavior.
    if (!text && !options.wordTimestamps) return null

    const segments: TranscriptSegment[] = (transcription?.segments || []).map((segment: any) => ({
      start: segment.start,
      end: segment.end,
      text: (segment.text || '').trim(),
      ...(options.wordTimestamps ? { noSpeechProb: segment.no_speech_prob, avgLogprob: segment.avg_logprob } : {})
    }))

    const result: OpenAITranscriptionResult = { text, segments, language: transcription?.language }
    if (options.wordTimestamps) {
      result.words = (transcription?.words || []).map((w: any) => ({ word: String(w.word ?? ''), start: w.start, end: w.end }))
    }
    return result

  } catch (error: any) {
    console.error('Error transcribing audio with OpenAI:', error.response?.data || error.message)
    return null
  }
}
