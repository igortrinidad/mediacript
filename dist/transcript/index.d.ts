import { Config } from '../types/index.js';
/**
 * Transcreve um arquivo de áudio tentando primeiro Groq, depois OpenAI
 * @param audioFilePath - Caminho do arquivo de áudio
 * @param config - Configuração com API keys
 * @returns Texto transcrito ou null
 */
export declare function transcribeAudio(audioFilePath: string, config: Config): Promise<string | null>;
/**
 * Salva a transcrição em arquivo
 */
export declare function saveTranscription(audioPath: string, transcription: string): string;
//# sourceMappingURL=index.d.ts.map