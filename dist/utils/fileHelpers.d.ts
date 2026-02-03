export type FileType = 'audio' | 'video' | 'unknown';
/**
 * Detecta o tipo de arquivo pela extensão
 */
export declare function detectFileType(filePath: string): FileType;
/**
 * Lista arquivos de áudio/vídeo no diretório
 */
export declare function listMediaFiles(dir: string): Array<{
    name: string;
    fullPath: string;
    type: FileType;
}>;
/**
 * Verifica se um arquivo existe
 */
export declare function fileExists(filePath: string): boolean;
//# sourceMappingURL=fileHelpers.d.ts.map