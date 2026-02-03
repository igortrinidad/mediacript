import fs from 'fs';
import path from 'path';
const AUDIO_EXTS = new Set(['.ogg', '.wav', '.mp3', '.m4a', '.aac', '.flac']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
/**
 * Detects file type by extension
 */
export function detectFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (AUDIO_EXTS.has(ext))
        return 'audio';
    if (VIDEO_EXTS.has(ext))
        return 'video';
    return 'unknown';
}
/**
 * Lists audio/video files in directory
 */
export function listMediaFiles(dir) {
    try {
        return fs
            .readdirSync(dir)
            .filter((name) => {
            const fullPath = path.join(dir, name);
            try {
                return fs.statSync(fullPath).isFile();
            }
            catch {
                return false;
            }
        })
            .map((name) => {
            const fullPath = path.join(dir, name);
            return {
                name,
                fullPath,
                type: detectFileType(name)
            };
        })
            .filter((f) => f.type !== 'unknown')
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    catch (error) {
        console.error('Error listing files:', error);
        return [];
    }
}
/**
 * Checks if a file exists
 */
export function fileExists(filePath) {
    try {
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=fileHelpers.js.map