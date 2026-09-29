import { ipcMain, BrowserWindow } from 'electron'
import { getStoredConfig } from 'mediacript'
import { fetchInstagramProfile } from '../lib/apifyInstagram'
import { analyzeProfile, transcribePosts } from '../lib/igAnalyzer'
import { clearIgChat, sendIgChatMessage } from '../lib/igChat'
import { createProject, deleteProject, listProjects, loadProject, refreshProject, toDetail } from '../lib/igProjectStore'
import type {
  AdChatMessage,
  IgAnalyzeRequest,
  IgChatRequest,
  IgCreateRequest,
  IgProfileAnalysis,
  IgProjectDetail,
  IgProjectSummary,
  IgTranscribeRequest
} from '../../shared/types'

function requireApifyKey(): string {
  const apiKey = getStoredConfig().apifyApiKey
  if (!apiKey) throw new Error('Configure o token da Apify em Settings › Chaves de API para coletar perfis do Instagram.')
  return apiKey
}

const clampLimit = (limit: number): number => Math.min(50, Math.max(1, Math.round(limit) || 16))

export function registerInstagramIpc(): void {
  ipcMain.handle('instagram:listProjects', (): IgProjectSummary[] => listProjects())

  ipcMain.handle('instagram:getProject', (_event, projectId: string): IgProjectDetail => toDetail(loadProject(projectId)))

  ipcMain.handle('instagram:createProject', async (_event, request: IgCreateRequest): Promise<IgProjectDetail> => {
    const fetched = await fetchInstagramProfile(request.username, clampLimit(request.limit), requireApifyKey())
    return toDetail(await createProject({ username: request.username, description: request.description?.trim() || undefined }, fetched))
  })

  ipcMain.handle('instagram:refreshProject', async (_event, projectId: string, limit: number): Promise<IgProjectDetail> => {
    const project = loadProject(projectId)
    const fetched = await fetchInstagramProfile(project.username, clampLimit(limit), requireApifyKey())
    return toDetail(await refreshProject(projectId, fetched))
  })

  ipcMain.handle('instagram:deleteProject', (_event, projectId: string, removeFiles: boolean): void => {
    deleteProject(projectId, removeFiles)
  })

  ipcMain.handle('instagram:transcribe', async (event, request: IgTranscribeRequest) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const { projectId } = request

    return transcribePosts(projectId, request.postIds, {
      onLog: (line) => {
        window?.webContents.send('instagram:log', { projectId, ...line, timestamp: new Date().toISOString() })
      },
      onProgress: (progress) => {
        window?.webContents.send('instagram:progress', { projectId, ...progress })
      }
    })
  })

  ipcMain.handle('instagram:analyze', (_event, request: IgAnalyzeRequest): Promise<IgProfileAnalysis> => analyzeProfile(request))

  ipcMain.handle('instagram:chat:send', (_event, request: IgChatRequest): Promise<AdChatMessage[]> => sendIgChatMessage(request))

  ipcMain.handle('instagram:chat:clear', (_event, projectId: string): void => clearIgChat(projectId))
}
