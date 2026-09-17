import { app, shell } from 'electron'
import { spawn } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type {
  UpdateAsset,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdateInfo,
  UpdateInstallMethod
} from '../../shared/types'

const REPO = 'igortrinidad/mediacript'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
export const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases/latest`
const FETCH_TIMEOUT_MS = 10_000
const USER_AGENT = 'mediacript-desktop'
const VERSION_PATTERN = /(\d+\.\d+\.\d+)/

interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GitHubRelease {
  tag_name?: string
  html_url?: string
  body?: string | null
  published_at?: string | null
  assets?: GitHubAsset[]
}

function parseVersion(text: string): string | null {
  return text.match(VERSION_PATTERN)?.[1] ?? null
}

/** Numeric semver compare on the x.y.z part only: >0 if a is newer than b. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Picks the release asset the current OS can install. Windows gets the NSIS
 * installer (not its .blockmap), macOS the DMG for its CPU (falling back to any
 * DMG, since Rosetta runs x64 builds on Apple Silicon), and Linux — which the
 * release workflow doesn't build for — gets nothing.
 */
function pickAsset(assets: GitHubAsset[]): { method: UpdateInstallMethod; asset: UpdateAsset | null } {
  const toAsset = (a: GitHubAsset): UpdateAsset => ({ name: a.name, url: a.browser_download_url, size: a.size })

  if (process.platform === 'win32') {
    const exe = assets.find((a) => /\.exe$/i.test(a.name))
    return exe ? { method: 'windows-installer', asset: toAsset(exe) } : { method: 'manual', asset: null }
  }

  if (process.platform === 'darwin') {
    const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name))
    const archTag = process.arch === 'arm64' ? 'arm64' : 'x64'
    const dmg = dmgs.find((a) => a.name.includes(`-${archTag}`)) ?? dmgs[0]
    return dmg ? { method: 'mac-dmg', asset: toAsset(dmg) } : { method: 'manual', asset: null }
  }

  return { method: 'manual', asset: null }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT }
    })
    if (!response.ok) {
      return { status: 'error', currentVersion, error: `GitHub respondeu HTTP ${response.status}` }
    }

    const release = (await response.json()) as GitHubRelease
    const latestVersion = parseVersion(release.tag_name ?? '')
    if (!latestVersion) {
      return { status: 'error', currentVersion, error: `Não foi possível ler a versão da release "${release.tag_name}"` }
    }

    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return { status: 'up-to-date', currentVersion }
    }

    const { method, asset } = pickAsset(release.assets ?? [])
    const update: UpdateInfo = {
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url ?? RELEASES_PAGE_URL,
      releaseNotes: release.body ?? '',
      publishedAt: release.published_at ?? null,
      installMethod: method,
      asset
    }
    return { status: 'available', currentVersion, update }
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'tempo esgotado' : String((error as Error)?.message ?? error)
    return { status: 'error', currentVersion, error: `Não foi possível consultar o GitHub (${reason})` }
  } finally {
    clearTimeout(timer)
  }
}

function downloadsDir(): string {
  const dir = join(app.getPath('temp'), 'mediacript-updates')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Downloads the asset into the OS temp dir, streaming progress to `onProgress`.
 * A file already there with the expected size is reused (the user may have
 * downloaded, then hit "Depois" and come back on the next launch).
 */
export async function downloadUpdate(
  asset: UpdateAsset,
  onProgress: (progress: UpdateDownloadProgress) => void
): Promise<string> {
  const destPath = join(downloadsDir(), asset.name)
  if (existsSync(destPath) && statSync(destPath).size === asset.size) {
    onProgress({ received: asset.size, total: asset.size, percent: 100 })
    return destPath
  }

  const response = await fetch(asset.url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok || !response.body) {
    throw new Error(`Download falhou: HTTP ${response.status}`)
  }

  const total = Number(response.headers.get('content-length')) || asset.size || 0
  let received = 0
  let lastPercent = -1
  const reader = response.body.getReader()
  const source = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read()
        if (done) {
          this.push(null)
          return
        }
        received += value.byteLength
        const percent = total ? Math.floor((received / total) * 100) : -1
        // One IPC message per percent point is plenty for a progress bar.
        if (percent !== lastPercent) {
          lastPercent = percent
          onProgress({ received, total, percent })
        }
        this.push(Buffer.from(value))
      } catch (error) {
        this.destroy(error as Error)
      }
    }
  })

  const partialPath = `${destPath}.part`
  try {
    await pipeline(source, createWriteStream(partialPath))
    rmSync(destPath, { force: true })
    renameSync(partialPath, destPath)
  } catch (error) {
    reader.cancel().catch(() => {})
    rmSync(partialPath, { force: true })
    throw error
  }

  onProgress({ received: total, total, percent: 100 })
  return destPath
}

/**
 * Path of the running .app bundle (…/Mediacript.app), or null when not
 * running from a bundle (dev mode) or from a read-only mounted DMG.
 */
function currentMacBundlePath(): string | null {
  // app.getPath('exe') → /Applications/Mediacript.app/Contents/MacOS/Mediacript
  const bundle = dirname(dirname(dirname(app.getPath('exe'))))
  if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/')) return null
  return bundle
}

/**
 * Mirrors packages/cli/scripts/install-mac.mjs, but runs after this process
 * exits so the bundle being replaced is no longer in use. Any failure leaves
 * the previous install untouched and opens the release page instead.
 */
function installMacDmg(dmgPath: string): void {
  const destPath = currentMacBundlePath() ?? '/Applications/Mediacript.app'
  const script = `#!/bin/sh
PID=${process.pid}
while kill -0 "$PID" 2>/dev/null; do sleep 0.5; done

MOUNT=$(hdiutil attach "${dmgPath}" -nobrowse -noautoopen | grep -o '/Volumes/.*' | head -n 1)
if [ -z "$MOUNT" ]; then open "${RELEASES_PAGE_URL}"; exit 1; fi

APP=$(ls -d "$MOUNT"/*.app 2>/dev/null | head -n 1)
if [ -z "$APP" ]; then hdiutil detach "$MOUNT" -quiet; open "${RELEASES_PAGE_URL}"; exit 1; fi

rm -rf "${destPath}"
if ! ditto "$APP" "${destPath}"; then hdiutil detach "$MOUNT" -quiet; open "${RELEASES_PAGE_URL}"; exit 1; fi

hdiutil detach "$MOUNT" -quiet || hdiutil detach "$MOUNT" -force -quiet
xattr -cr "${destPath}"
open "${destPath}"
`
  const scriptPath = join(downloadsDir(), 'install-update.sh')
  writeFileSync(scriptPath, script, { mode: 0o755 })

  const child = spawn('/bin/sh', [scriptPath], { detached: true, stdio: 'ignore' })
  child.unref()
  app.quit()
}

function installWindowsInstaller(exePath: string): void {
  // The NSIS installer closes the running app itself, but quitting first avoids
  // its "Mediacript is running" prompt and keeps stores from being written mid-upgrade.
  const child = spawn(exePath, [], { detached: true, stdio: 'ignore' })
  child.once('spawn', () => {
    child.unref()
    app.quit()
  })
  // spawn() can't elevate (ERROR_ELEVATION_REQUIRED on a per-machine installer);
  // ShellExecute via openPath shows the UAC prompt instead.
  child.once('error', () => {
    shell.openPath(exePath).then(() => app.quit())
  })
}

export async function installUpdate(method: UpdateInstallMethod, filePath: string | null): Promise<void> {
  if (method === 'windows-installer' && filePath) {
    installWindowsInstaller(filePath)
    return
  }
  if (method === 'mac-dmg' && filePath) {
    installMacDmg(filePath)
    return
  }
  await shell.openExternal(RELEASES_PAGE_URL)
}
