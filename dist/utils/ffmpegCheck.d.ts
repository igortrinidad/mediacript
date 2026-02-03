/**
 * Checks if ffmpeg is installed and available in PATH
 */
export declare function checkFfmpegInstalled(): {
    installed: boolean;
    version?: string;
    error?: string;
};
/**
 * Displays ffmpeg installation instructions based on operating system
 */
export declare function showFfmpegInstallInstructions(): void;
/**
 * Checks and reports on ffmpeg installation
 * Returns true if installed, false otherwise
 */
export declare function verifyFfmpeg(): boolean;
//# sourceMappingURL=ffmpegCheck.d.ts.map