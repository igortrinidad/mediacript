import FormData from 'form-data'
import fs from 'fs'
import axios from 'axios'
import type { TranscriptSegment, TranscriptWord, TranscriptionRequestOptions } from '../types/index.js'

export interface GroqTranscriptionResult {
  text: string
  segments: TranscriptSegment[]
  /** Only present when `options.wordTimestamps` was requested */
  words?: TranscriptWord[]
  /** Language reported by the provider, if any */
  language?: string
}

/**
 * Upload + transcription budget for a single request. Generous by default: a
 * ~10MB chunk (the largest `transcribeAudioWithSegments` produces) on a slow
 * uplink can take minutes, and timing out early makes the caller fall back to
 * another provider — or fail a long recording outright — for no good reason.
 */
const DEFAULT_TIMEOUT_MS = 300000

/**
 * Transcribes an audio file using Groq Whisper
 * https://console.groq.com/docs/speech-to-text
 * @param audioLocalFilePath - Local audio file path
 * @param apiKey - Groq API Key
 * @param timeoutMs - Request timeout in milliseconds (default: 5 minutes)
 * @param options - Optional language, prompt and word-timestamp request
 * @returns Transcribed text with segment-level timestamps, or null in case of error
 */
export const groqTranscriptAudio = async (
  audioLocalFilePath: string,
  apiKey: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  options: TranscriptionRequestOptions = {}
): Promise<GroqTranscriptionResult | null> => {

  if (!apiKey) {
    console.error('❌ Groq API Key not provided')
    return null
  }

  try {
    const formData = new FormData()

    // Add the file from local path
    formData.append('file', fs.createReadStream(audioLocalFilePath))
    formData.append('model', 'whisper-large-v3')
    formData.append('response_format', 'verbose_json')
    formData.append('temperature', '0')
    if (options.language) formData.append('language', options.language)
    if (options.prompt) formData.append('prompt', options.prompt)
    if (options.wordTimestamps) {
      formData.append('timestamp_granularities[]', 'word')
      formData.append('timestamp_granularities[]', 'segment')
    }

    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      formData,
      {
        timeout: timeoutMs,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...formData.getHeaders()
        }
      }
    )

    const text = (data?.text || '').trim()
    // A chunk without speech is a valid result when word timings are wanted (the
    // timeline stays intact); otherwise keep the original "empty = failure" behavior.
    if (!text && !options.wordTimestamps) return null

    const segments: TranscriptSegment[] = (data?.segments || []).map((segment: any) => ({
      start: segment.start,
      end: segment.end,
      text: (segment.text || '').trim(),
      ...(options.wordTimestamps ? { noSpeechProb: segment.no_speech_prob, avgLogprob: segment.avg_logprob } : {})
    }))

    const result: GroqTranscriptionResult = { text, segments, language: data?.language }
    if (options.wordTimestamps) {
      result.words = (data?.words || []).map((w: any) => ({ word: String(w.word ?? ''), start: w.start, end: w.end }))
    }
    return result

  } catch (error: any) {
    console.error('Error transcribing audio with Groq:', error.response?.data || error.message)
    return null
  }
}
