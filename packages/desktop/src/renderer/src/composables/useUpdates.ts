import { reactive, readonly } from 'vue'
import type { UpdateDownloadProgress, UpdateInfo } from '@shared/types'
import { toPlain } from '../shared/toPlain'

type UpdatePhase = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'

const state = reactive({
  phase: 'idle' as UpdatePhase,
  currentVersion: '',
  update: null as UpdateInfo | null,
  progress: null as UpdateDownloadProgress | null,
  /** Local path of the downloaded installer/DMG once `phase` is `ready` */
  downloadedPath: null as string | null,
  error: null as string | null,
  /** Drives the startup popup; "Depois" hides it for this session only, so it comes back on the next launch */
  dialogOpen: false,
  checkedAt: null as Date | null
})

let stopProgress: (() => void) | null = null

async function loadCurrentVersion(): Promise<void> {
  if (!state.currentVersion) state.currentVersion = await window.api.updates.currentVersion()
}

/**
 * Asks GitHub for the latest release. With `openDialog`, a newer version pops
 * the dialog (the startup path); without it, only the state changes (Settings
 * shows the outcome inline).
 */
async function check(openDialog: boolean): Promise<void> {
  if (state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'installing') return
  state.phase = 'checking'
  state.error = null

  const result = await window.api.updates.check()
  state.currentVersion = result.currentVersion
  state.checkedAt = new Date()

  if (result.status === 'available' && result.update) {
    // A download that already finished for this very version is still good.
    const sameAsReady = state.update?.latestVersion === result.update.latestVersion && state.downloadedPath
    state.update = result.update
    state.phase = sameAsReady ? 'ready' : 'available'
    if (openDialog) state.dialogOpen = true
  } else if (result.status === 'up-to-date') {
    state.phase = 'up-to-date'
    state.update = null
  } else {
    state.phase = 'error'
    state.error = result.error ?? 'Falha ao verificar atualizações'
  }
}

async function download(): Promise<void> {
  const update = state.update
  if (!update?.asset || state.phase === 'downloading') return

  state.phase = 'downloading'
  state.error = null
  state.progress = { received: 0, total: update.asset.size, percent: 0 }

  stopProgress?.()
  stopProgress = window.api.updates.onProgress((progress) => {
    state.progress = progress
  })

  try {
    state.downloadedPath = await window.api.updates.download(toPlain(update.asset))
    state.phase = 'ready'
  } catch (error) {
    state.phase = 'error'
    state.error = error instanceof Error ? error.message : String(error)
  } finally {
    stopProgress?.()
    stopProgress = null
  }
}

/** Quits and hands over to the installer; for platforms without an asset it opens the release page. */
async function install(): Promise<void> {
  const update = state.update
  if (!update) return
  state.phase = 'installing'
  try {
    await window.api.updates.install(update.installMethod, state.downloadedPath)
  } catch (error) {
    state.phase = 'error'
    state.error = error instanceof Error ? error.message : String(error)
  }
}

/** One click for the dialog's primary button: downloads if needed, then installs. */
async function downloadAndInstall(): Promise<void> {
  const update = state.update
  if (!update) return
  if (update.installMethod === 'manual') {
    await window.api.updates.openReleasePage(update.releaseUrl)
    return
  }
  if (!state.downloadedPath) {
    await download()
    if (state.phase !== 'ready') return
  }
  await install()
}

function openReleasePage(): void {
  window.api.updates.openReleasePage(state.update?.releaseUrl)
}

function openDialog(): void {
  if (state.update) state.dialogOpen = true
}

function dismissDialog(): void {
  state.dialogOpen = false
}

export function useUpdates() {
  return {
    state: readonly(state),
    loadCurrentVersion,
    check,
    download,
    install,
    downloadAndInstall,
    openReleasePage,
    openDialog,
    dismissDialog
  }
}
