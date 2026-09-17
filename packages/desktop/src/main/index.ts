import { app, session, shell, nativeTheme, BrowserWindow } from 'electron'
import { join } from 'path'

// Windows Graphics Capture (WGC) spams "wgc_capture_session.cc ProcessFrame
// failed, using existing frame: 0x80004005" and can yield black/frozen frames,
// especially when a captured window is hidden/occluded. Fall back to the legacy
// DXGI/GDI capturer, which is more reliable for our screencast recorder.
// Must run before app.whenReady().
if (process.platform === 'win32') {
  app.commandLine.appendSwitch(
    'disable-features',
    'AllowWgcScreenCapturer,AllowWgcWindowCapturer,AllowWgcDesktopCapturer,AllowWgcZeroHz'
  )
}
import { registerConfigIpc, applyStoredTheme } from './ipc/config'
import { registerFilesIpc } from './ipc/files'
import { registerJobsIpc } from './ipc/jobs'
import { registerHistoryIpc } from './ipc/history'
import { registerFfmpegIpc } from './ipc/ffmpeg'
import { registerCompressIpc } from './ipc/compress'
import { registerHighlightChatIpc } from './ipc/highlightChat'
import { registerAgentsIpc } from './ipc/agents'
import { registerScreencastIpc } from './ipc/screencast'
import { registerMeetingsIpc } from './ipc/meetings'
import { registerUpdatesIpc } from './ipc/updates'
import { registerMediaProtocol } from './lib/mediaProtocol'
import { fixShellPath } from './lib/shellPath'

// Dock/Finder launches on macOS don't inherit the shell PATH, so a Homebrew
// ffmpeg would show as "not installed". Must run before any IPC handler spawns it.
fixShellPath()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // Matches the renderer palette so the window does not flash white before
    // the first paint when the user is on the dark theme.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#f5f6f8',
    title: 'Mediacript',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      // Keeps the recording canvas's rAF loop and MediaRecorder running at
      // full rate while this window is hidden during screencast recording.
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

  applyStoredTheme()
  registerMediaProtocol()
  registerConfigIpc()
  registerFilesIpc()
  registerJobsIpc()
  registerHistoryIpc()
  registerFfmpegIpc()
  registerCompressIpc()
  registerHighlightChatIpc()
  registerAgentsIpc()
  registerScreencastIpc()
  registerMeetingsIpc()
  registerUpdatesIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
