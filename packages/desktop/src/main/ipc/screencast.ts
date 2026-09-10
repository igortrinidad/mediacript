import { ipcMain, desktopCapturer, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { getScreencastPreferences, saveRawRecording, saveScreencastPreferences } from '../lib/screencastStore'
import { processRecording } from '../lib/screencastRunner'
import type {
  ScreenSource,
  ScreencastControlAction,
  ScreencastControlWindowOptions,
  ScreencastPreferences,
  ScreencastProcessRequest,
  ScreencastProcessResult
} from '../../shared/types'

let controlWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null

function windowFromEvent(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    throw new Error('Nenhuma janela associada a este evento')
  }
  return window
}

function createControlWindow(options: ScreencastControlWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 320,
    height: 70,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })
  window.setAlwaysOnTop(true, 'screen-saver')

  const query = `mic=${options.micEnabled ? '1' : '0'}&cam=${options.cameraEnabled ? '1' : '0'}`
  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/screencast-control?${query}`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/screencast-control?${query}` })
  }

  window.on('closed', () => {
    controlWindow = null
  })

  return window
}

export function registerScreencastIpc(): void {
  ipcMain.handle('screencast:listSources', async (): Promise<ScreenSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 300, height: 200 }
    })
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnailDataUrl: source.thumbnail.toDataURL()
    }))
  })

  ipcMain.handle('screencast:saveRawRecording', (_event, buffer: ArrayBuffer): string => {
    return saveRawRecording(Buffer.from(buffer))
  })

  ipcMain.handle('screencast:getPreferences', (): Partial<ScreencastPreferences> | null => {
    return getScreencastPreferences()
  })

  ipcMain.handle('screencast:savePreferences', (_event, preferences: ScreencastPreferences): void => {
    saveScreencastPreferences(preferences)
  })

  ipcMain.handle(
    'screencast:process',
    async (event, request: ScreencastProcessRequest): Promise<ScreencastProcessResult> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      return processRecording(
        request,
        (step, status, detail) => window?.webContents.send('screencast:progress', { step, status, detail }),
        (line) => window?.webContents.send('screencast:log', line)
      )
    }
  )

  ipcMain.handle('screencast:openControlWindow', (event, options: ScreencastControlWindowOptions): void => {
    mainWindow = windowFromEvent(event)
    controlWindow = createControlWindow(options)
    mainWindow.hide()
  })

  ipcMain.handle('screencast:closeControlWindow', (): void => {
    controlWindow?.close()
    controlWindow = null
    mainWindow?.show()
    mainWindow?.focus()
  })

  ipcMain.on('screencast:controlAction', (_event, action: ScreencastControlAction): void => {
    mainWindow?.webContents.send('screencast:controlAction', action)
  })
}
