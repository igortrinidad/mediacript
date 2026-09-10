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

/**
 * Floater geometry. The preview pane opens above the bar, so the window grows
 * upwards and the bar itself stays put — see `setControlPreview`.
 */
const CONTROL_WIDTH = 320
const CONTROL_BAR_HEIGHT = 70
const CONTROL_PREVIEW_HEIGHT = 180

function controlWindowHeight(previewEnabled: boolean): number {
  return previewEnabled ? CONTROL_BAR_HEIGHT + CONTROL_PREVIEW_HEIGHT : CONTROL_BAR_HEIGHT
}

/**
 * With the preview on, the floater is showing the very screen it sits on — left
 * capturable it films itself, hall of mirrors, straight into the output. On
 * Windows 10 2004+ and macOS this excludes the window from the capture
 * altogether; on older Windows builds it turns into a black rectangle in the
 * recording instead, which is still better than the recursion.
 */
function setControlPreview(enabled: boolean): void {
  if (!controlWindow) return
  const bounds = controlWindow.getBounds()
  const height = controlWindowHeight(enabled)
  // Windows pins a non-resizable window to the size it was created at, so the
  // flag has to come off for the duration of the programmatic resize.
  controlWindow.setResizable(true)
  controlWindow.setBounds({
    x: bounds.x,
    y: bounds.y + bounds.height - height,
    width: CONTROL_WIDTH,
    height
  })
  controlWindow.setResizable(false)
  controlWindow.setContentProtection(enabled)
}

function createControlWindow(options: ScreencastControlWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: CONTROL_WIDTH,
    height: controlWindowHeight(options.previewEnabled),
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
  window.setContentProtection(options.previewEnabled)

  const query = [
    `mic=${options.micEnabled ? '1' : '0'}`,
    `cam=${options.cameraEnabled ? '1' : '0'}`,
    `preview=${options.previewEnabled ? '1' : '0'}`
  ].join('&')
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
    // The preview toggle is the one action the floater's own window has to
    // react to as well — it changes how tall the window has to be.
    if (action === 'preview-on' || action === 'preview-off') {
      setControlPreview(action === 'preview-on')
    }
    mainWindow?.webContents.send('screencast:controlAction', action)
  })

  // Preview frames flow the other way: composed in the (hidden) main window,
  // relayed here to the floater. Fire-and-forget — a frame is only useful while
  // it's current, and a dropped one just repeats the last image for 200ms.
  ipcMain.on('screencast:previewFrame', (_event, frame: string): void => {
    controlWindow?.webContents.send('screencast:previewFrame', frame)
  })
}
