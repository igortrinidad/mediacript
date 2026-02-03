import FormData from 'form-data'
import fs from 'fs'
import axios from 'axios'

/**
 * Transcribes an audio file using Groq Whisper
 * https://console.groq.com/docs/speech-to-text
 * @param audioLocalFilePath - Local audio file path
 * @param apiKey - Groq API Key
 * @returns Transcribed text or null in case of error
 */
export const groqTranscriptAudio = async (
  audioLocalFilePath: string,
  apiKey: string
): Promise<string | null> => {
  
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
    // formData.append('language', 'pt')

    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      formData,
      {
        timeout: 60000,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...formData.getHeaders()
        }
      }
    )

    return data?.text?.trim() || null

  } catch (error: any) {
    console.error('Error transcribing audio with Groq:', error.response?.data || error.message)
    return null
  }
}
