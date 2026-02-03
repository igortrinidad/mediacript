import fs from 'fs';
import OpenAI from 'openai';
/**
 * Transcreve um arquivo de áudio usando OpenAI Whisper
 * @param audioLocalFilePath - Caminho local do arquivo de áudio
 * @param apiKey - API Key da OpenAI
 * @returns Texto transcrito ou null em caso de erro
 */
export const openaiTranscriptAudio = async (audioLocalFilePath, apiKey) => {
    if (!apiKey) {
        console.error('❌ OpenAI API Key não fornecida');
        return null;
    }
    try {
        const openai = new OpenAI({ apiKey });
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioLocalFilePath),
            model: 'whisper-1',
        });
        return transcription.text ?? null;
    }
    catch (error) {
        console.error('Erro ao transcrever áudio com OpenAI:', error.response?.data || error.message);
        return null;
    }
};
//# sourceMappingURL=openai.js.map