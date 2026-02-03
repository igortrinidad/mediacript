import fs from 'fs';
import OpenAI from 'openai';
/**
 * Transcribes an audio file using OpenAI Whisper
 * @param audioLocalFilePath - Local audio file path
 * @param apiKey - OpenAI API Key
 * @returns Transcribed text or null in case of error
 */
export const openaiTranscriptAudio = async (audioLocalFilePath, apiKey) => {
    if (!apiKey) {
        console.error('❌ OpenAI API Key not provided');
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
        console.error('Error transcribing audio with OpenAI:', error.response?.data || error.message);
        return null;
    }
};
//# sourceMappingURL=openai.js.map