import fs from 'fs'
import path from 'path'

const AUDIO_EXTS = new Set(['.ogg', '.wav', '.mp3', '.m4a', '.aac', '.flac'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi'])

export type FileType = 'audio' | 'video' | 'unknown'

/**
 * Detecta o tipo de arquivo pela extensão
 */
export function detectFileType(filePath: string): FileType {
  const ext = path.extname(filePath).toLowerCase()
  
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'unknown'
}

/**
 * Lista arquivos de áudio/vídeo no diretório
 */
export function listMediaFiles(dir: string): Array<{ name: string; fullPath: string; type: FileType }> {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => {
        const fullPath = path.join(dir, name)
        try {
          return fs.statSync(fullPath).isFile()
        } catch {
          return false
        }
      })
      .map((name) => {
        const fullPath = path.join(dir, name)
        return {
          name,
          fullPath,
          type: detectFileType(name)
        }
      })
      .filter((f) => f.type !== 'unknown')
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Erro ao listar arquivos:', error)
    return []
  }
}

/**
 * Verifica se um arquivo existe
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}
