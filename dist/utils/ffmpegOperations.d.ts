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
/**
 * Gets the duration of an audio file in seconds
 */
export declare function getAudioDuration(inputPath: string): Promise<number>;
/**
 * Splits an audio file into chunks of specified size (in MB)
 * Returns an array of chunk file paths
 */
export declare function splitAudioIntoChunks(inputPath: string, maxSizeMB?: number): Promise<string[]>;
/**
 * Deletes a directory and all its contents
 */
export declare function deleteDirectory(dirPath: string): void;
//# sourceMappingURL=ffmpegOperations.d.ts.map