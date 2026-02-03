/**
 * Transcreve um arquivo de áudio usando Groq Whisper
 * https://console.groq.com/docs/speech-to-text
 * @param audioLocalFilePath - Caminho local do arquivo de áudio
 * @param apiKey - API Key do Groq
 * @returns Texto transcrito ou null em caso de erro
 */
export declare const groqTranscriptAudio: (audioLocalFilePath: string, apiKey: string) => Promise<string | null>;
//# sourceMappingURL=groq.d.ts.map