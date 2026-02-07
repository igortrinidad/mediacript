export type FileType = 'audio' | 'video' | 'unknown';
/**
 * Detects file type by extension
 */
export declare function detectFileType(filePath: string): FileType;
/**
 * Lists audio/video files in directory
 */
export declare function listMediaFiles(dir: string): Array<{
    name: string;
    fullPath: string;
    type: FileType;
}>;
/**
 * Checks if a file exists
 */
export declare function fileExists(filePath: string): boolean;
/**
 * Gets file size in bytes
 */
export declare function getFileSize(filePath: string): number;
/**
 * Converts bytes to MB
 */
export declare function bytesToMB(bytes: number): number;
//# sourceMappingURL=fileHelpers.d.ts.map