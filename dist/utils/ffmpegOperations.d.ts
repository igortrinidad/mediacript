/**
 * Gera um caminho único para o arquivo de saída
 */
export declare function uniqueOutputPath(dir: string, baseName: string, extWithDot: string): string;
/**
 * Executa um comando ffmpeg
 */
export declare function runFfmpegCommand(args: string[]): Promise<string>;
/**
 * Converte vídeo para formato performático (H.264/AAC)
 */
export declare function convertVideo(inputPath: string, outputDir?: string): Promise<string>;
/**
 * Extrai áudio de um vídeo
 */
export declare function extractAudio(inputPath: string, outputDir?: string): Promise<string>;
/**
 * Converte áudio para formato performático
 */
export declare function convertAudio(inputPath: string, outputDir?: string): Promise<string>;
//# sourceMappingURL=ffmpegOperations.d.ts.map