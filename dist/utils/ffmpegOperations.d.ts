/**
 * Generates unique output file path
 */
export declare function uniqueOutputPath(dir: string, baseName: string, extWithDot: string): string;
/**
 * Executes an ffmpeg command
 */
export declare function runFfmpegCommand(args: string[]): Promise<string>;
/**
 * Converts video to performant format (H.264/AAC)
 */
export declare function convertVideo(inputPath: string, outputDir?: string): Promise<string>;
/**
 * Extracts audio from a video
 */
export declare function extractAudio(inputPath: string, outputDir?: string): Promise<string>;
/**
 * Converts audio to performant format
 */
export declare function convertAudio(inputPath: string, outputDir?: string): Promise<string>;
//# sourceMappingURL=ffmpegOperations.d.ts.map