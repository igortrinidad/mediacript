/**
 * Verifica se o ffmpeg está instalado e disponível no PATH
 */
export declare function checkFfmpegInstalled(): {
    installed: boolean;
    version?: string;
    error?: string;
};
/**
 * Exibe instruções de instalação do ffmpeg baseado no sistema operacional
 */
export declare function showFfmpegInstallInstructions(): void;
/**
 * Verifica e informa sobre a instalação do ffmpeg
 * Retorna true se instalado, false caso contrário
 */
export declare function verifyFfmpeg(): boolean;
//# sourceMappingURL=ffmpegCheck.d.ts.map