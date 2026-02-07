import { Config } from '../types/index.js';
/**
 * Transcribes an audio file, automatically splitting if larger than 10MB
 * @param audioFilePath - Audio file path
 * @param config - Configuration with API keys
 * @returns Transcribed text or null
 */
export declare function transcribeAudio(audioFilePath: string, config: Config): Promise<string | null>;
/**
 * Saves transcription to file
 */
export declare function saveTranscription(audioPath: string, transcription: string): string;
//# sourceMappingURL=index.d.ts.map