import FormData from 'form-data'
import fs from 'fs'
import axios from 'axios'

/**
 * Transcreve um arquivo de áudio usando Groq Whisper
 * https://console.groq.com/docs/speech-to-text
 * @param audioLocalFilePath - Caminho local do arquivo de áudio
 * @param apiKey - API Key do Groq
 * @returns Texto transcrito ou null em caso de erro
 */
export const groqTranscriptAudio = async (
  audioLocalFilePath: string,
  apiKey: string
): Promise<string | null> => {
  
  if (!apiKey) {
    console.error('❌ Groq API Key não fornecida')
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
    console.error('Erro ao transcrever áudio com Groq:', error.response?.data || error.message)
    return null
  }
}
