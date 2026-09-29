import { ipcMain, BrowserWindow } from 'electron'
import { getStoredConfig } from 'mediacript'
import { searchAds } from '../lib/apifyAds'
import { analyzeAd, transcribeAd } from '../lib/adAnalyzer'
import { clearAdChat, sendAdChatMessage } from '../lib/adChat'
import {
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  removeAdFromProject,
  saveAdToProject,
  toDetail
} from '../lib/adProjectStore'
import type {
  AdAnalyzeRequest,
  AdChatMessage,
  AdChatRequest,
  AdItem,
  AdProjectDetail,
  AdProjectSummary,
  AdSearchRequest,
  SavedAd
} from '../../shared/types'

export function registerAdsIpc(): void {
  ipcMain.handle('ads:listProjects', (): AdProjectSummary[] => listProjects())

  ipcMain.handle(
    'ads:createProject',
    (_event, input: { name: string; description?: string }): AdProjectDetail =>
      toDetail(createProject({ name: input.name.trim() || 'Projeto sem nome', description: input.description?.trim() || undefined }))
  )

  ipcMain.handle('ads:getProject', (_event, projectId: string): AdProjectDetail => toDetail(loadProject(projectId)))

  ipcMain.handle('ads:deleteProject', (_event, projectId: string, removeFiles: boolean): void => {
    deleteProject(projectId, removeFiles)
  })

  ipcMain.handle('ads:search', async (_event, request: AdSearchRequest): Promise<AdItem[]> => {
    const apiKey = getStoredConfig().apifyApiKey
    if (!apiKey) throw new Error('Configure o token da Apify em Settings › Chaves de API para buscar anúncios.')
    return searchAds(request, apiKey)
  })

  ipcMain.handle('ads:saveAd', async (_event, projectId: string, ad: AdItem): Promise<AdProjectDetail> => {
    return toDetail(await saveAdToProject(projectId, ad))
  })

  ipcMain.handle('ads:removeAd', (_event, projectId: string, adId: string): AdProjectDetail => {
    return toDetail(removeAdFromProject(projectId, adId))
  })

  ipcMain.handle('ads:analyze', async (event, request: AdAnalyzeRequest): Promise<SavedAd> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const { projectId, adId } = request

    return analyzeAd(projectId, adId, request.engine, request.model, {
      onLog: (line) => {
        window?.webContents.send('ads:log', { projectId, adId, ...line, timestamp: new Date().toISOString() })
      },
      onProgress: (progress) => {
        window?.webContents.send('ads:progress', { projectId, adId, ...progress })
      }
    })
  })

  ipcMain.handle('ads:transcribe', async (event, projectId: string, adId: string): Promise<SavedAd> => {
    const window = BrowserWindow.fromWebContents(event.sender)

    return transcribeAd(projectId, adId, {
      onLog: (line) => {
        window?.webContents.send('ads:log', { projectId, adId, ...line, timestamp: new Date().toISOString() })
      },
      onProgress: (progress) => {
        window?.webContents.send('ads:progress', { projectId, adId, ...progress })
      }
    })
  })

  ipcMain.handle('ads:chat:send', (_event, request: AdChatRequest): Promise<AdChatMessage[]> => sendAdChatMessage(request))

  ipcMain.handle('ads:chat:clear', (_event, projectId: string): void => clearAdChat(projectId))
}
