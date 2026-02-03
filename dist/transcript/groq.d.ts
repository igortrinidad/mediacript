/**
 * Transcribes an audio file using Groq Whisper
 * https://console.groq.com/docs/speech-to-text
 * @param audioLocalFilePath - Local audio file path
 * @param apiKey - Groq API Key
 * @returns Transcribed text or null in case of error
 */
export declare const groqTranscriptAudio: (audioLocalFilePath: string, apiKey: string) => Promise<string | null>;
//# sourceMappingURL=groq.d.ts.map