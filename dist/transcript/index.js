import path from 'path';
import fs from 'fs';
import { groqTranscriptAudio } from './groq.js';
import { openaiTranscriptAudio } from './openai.js';
/**
 * Transcreve um arquivo de áudio tentando primeiro Groq, depois OpenAI
 * @param audioFilePath - Caminho do arquivo de áudio
 * @param config - Configuração com API keys
 * @returns Texto transcrito ou null
 */
export async function transcribeAudio(audioFilePath, config) {
    console.log(`\n🎙️  Transcrevendo: ${path.basename(audioFilePath)}`);
    // Tenta Groq primeiro (mais rápido e barato)
    if (config.groqApiKey) {
        console.log('📡 Tentando Groq Whisper (rápido)...');
        const result = await groqTranscriptAudio(audioFilePath, config.groqApiKey);
        if (result) {
            console.log('✓ Transcrição concluída com Groq');
            return result;
        }
        console.log('⚠️  Falha com Groq, tentando OpenAI...');
    }
    // Se Groq falhou ou não está configurado, tenta OpenAI
    if (config.openaiApiKey) {
        console.log('📡 Tentando OpenAI Whisper...');
        const result = await openaiTranscriptAudio(audioFilePath, config.openaiApiKey);
        if (result) {
            console.log('✓ Transcrição concluída com OpenAI');
            return result;
        }
    }
    // Se chegou aqui, nenhum serviço funcionou
    if (!config.groqApiKey && !config.openaiApiKey) {
        console.error('❌ Nenhuma API key configurada para transcrição');
    }
    else {
        console.error('❌ Falha ao transcrever com todos os serviços disponíveis');
    }
    return null;
}
/**
 * Salva a transcrição em arquivo
 */
export function saveTranscription(audioPath, transcription) {
    const outputFileName = path.basename(audioPath, path.extname(audioPath)) + '.txt';
    const outputPath = path.join(path.dirname(audioPath), outputFileName);
    fs.writeFileSync(outputPath, transcription, 'utf-8');
    return outputPath;
}
//# sourceMappingURL=index.js.map