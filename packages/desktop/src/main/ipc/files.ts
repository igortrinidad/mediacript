import { ipcMain, dialog, shell, clipboard, BrowserWindow, type IpcMainInvokeEvent } from 'electron'

const MEDIA_EXTENSIONS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'ogg', 'wav', 'mp3', 'm4a', 'aac', 'flac']

function windowFromEvent(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    throw new Error('Nenhuma janela associada a este evento')
  }
  return window
}

export function registerFilesIpc(): void {
  // The renderer can't use `navigator.clipboard`: the session's permission handler (main/index.ts)
  // denies everything but `media`, which includes clipboard-write. Electron's own clipboard needs no permission.
  ipcMain.handle('clipboard:writeText', (_event, text: string): void => {
    clipboard.writeText(String(text))
  })

  ipcMain.handle('files:pick', async (event): Promise<string[]> => {
    const result = await dialog.showOpenDialog(windowFromEvent(event), {
      title: 'Selecionar vídeos ou áudios',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Vídeos e áudios', extensions: MEDIA_EXTENSIONS },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('files:pickDirectory', async (event): Promise<string | null> => {
    const result = await dialog.showOpenDialog(windowFromEvent(event), {
      title: 'Selecionar pasta de saída',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('files:openFile', async (_event, path: string): Promise<void> => {
    await shell.openPath(path)
  })

  ipcMain.handle('files:revealInFolder', (_event, path: string): void => {
    shell.showItemInFolder(path)
  })
}
