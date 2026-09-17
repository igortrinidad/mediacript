import { app, ipcMain, shell } from 'electron'
import { checkForUpdate, downloadUpdate, installUpdate, RELEASES_PAGE_URL } from '../lib/updater'
import type { UpdateAsset, UpdateCheckResult, UpdateInstallMethod } from '../../shared/types'

export function registerUpdatesIpc(): void {
  ipcMain.handle('updates:currentVersion', (): string => app.getVersion())

  ipcMain.handle('updates:check', (): Promise<UpdateCheckResult> => checkForUpdate())

  ipcMain.handle('updates:download', (event, asset: UpdateAsset): Promise<string> => {
    return downloadUpdate(asset, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('updates:progress', progress)
    })
  })

  ipcMain.handle('updates:install', (_event, method: UpdateInstallMethod, filePath: string | null): Promise<void> => {
    return installUpdate(method, filePath)
  })

  ipcMain.handle('updates:openReleasePage', (_event, url?: string): Promise<void> => {
    return shell.openExternal(url ?? RELEASES_PAGE_URL)
  })
}
