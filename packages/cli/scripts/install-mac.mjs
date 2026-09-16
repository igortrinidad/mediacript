import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'

const REPO = 'igortrinidad/mediacript'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const APP_NAME_PATTERN = /^Mediacript.*\.dmg$/i
// Matches electron-builder's default artifact name: Mediacript-1.2.30-arm64.dmg
const VERSION_PATTERN = /(\d+\.\d+\.\d+)/
const APPLICATIONS_DIR = '/Applications'
const FETCH_TIMEOUT_MS = 10_000

function fail(message) {
  console.error(`\n❌ ${message}`)
  process.exit(1)
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' })
}

function parseVersion(text) {
  const match = text.match(VERSION_PATTERN)
  return match ? match[1] : null
}

/** Numeric semver compare on the x.y.z part only: >0 if a is newer than b. */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function downloadsDir() {
  const downloads = join(homedir(), 'Downloads')
  if (!existsSync(downloads)) {
    fail(`Pasta de Downloads não encontrada em ${downloads}`)
  }
  return downloads
}

/** Newest-looking Mediacript DMG already in ~/Downloads (by parsed version, then mtime), or null. */
function findLocalDmg(downloads) {
  const candidates = readdirSync(downloads)
    .filter((name) => APP_NAME_PATTERN.test(name))
    .map((name) => {
      const fullPath = join(downloads, name)
      const stat = statSync(fullPath)
      return { name, fullPath, version: parseVersion(name), mtime: stat.mtimeMs, size: stat.size }
    })
    .sort((a, b) => {
      if (a.version && b.version) {
        const byVersion = compareVersions(b.version, a.version)
        if (byVersion !== 0) return byVersion
      }
      return b.mtime - a.mtime
    })

  return candidates[0] ?? null
}

/** Currently installed app version, read from the bundle's Info.plist, or null. */
function findInstalledVersion() {
  const plist = join(APPLICATIONS_DIR, 'Mediacript.app', 'Contents', 'Info.plist')
  if (!existsSync(plist)) return null
  try {
    return run('defaults', ['read', plist, 'CFBundleShortVersionString']).trim() || null
  } catch {
    return null
  }
}

/**
 * Resolves the latest GitHub release's DMG for this machine's architecture.
 * Returns null (instead of throwing) on any network/API problem so the caller
 * can fall back to a DMG already sitting in ~/Downloads.
 */
async function fetchLatestRelease() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mediacript-install-mac' }
    })
    if (!response.ok) {
      console.warn(`⚠️  GitHub respondeu ${response.status} ao consultar a última release.`)
      return null
    }
    const release = await response.json()
    const dmgs = (release.assets ?? []).filter((asset) => APP_NAME_PATTERN.test(asset.name))
    if (dmgs.length === 0) {
      console.warn('⚠️  A última release não tem nenhum .dmg publicado.')
      return null
    }

    // Prefer the asset built for this CPU; fall back to whatever is there
    // (Rosetta can run an x64 build on Apple Silicon, not the other way around).
    const archTag = process.arch === 'arm64' ? 'arm64' : 'x64'
    const asset = dmgs.find((a) => a.name.includes(`-${archTag}`)) ?? dmgs[0]
    const version = parseVersion(release.tag_name ?? '') ?? parseVersion(asset.name)
    if (!version) {
      console.warn(`⚠️  Não foi possível ler a versão da release "${release.tag_name}".`)
      return null
    }

    return { version, name: asset.name, url: asset.browser_download_url, size: asset.size }
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'tempo esgotado' : error.message
    console.warn(`⚠️  Não foi possível consultar o GitHub (${reason}).`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function downloadFile(url, destPath, expectedSize) {
  const response = await fetch(url, { headers: { 'User-Agent': 'mediacript-install-mac' } })
  if (!response.ok || !response.body) {
    throw new Error(`Download falhou: HTTP ${response.status}`)
  }

  const total = Number(response.headers.get('content-length')) || expectedSize || 0
  let received = 0
  let lastPrinted = -1
  const progress = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength
      if (total) {
        const pct = Math.floor((received / total) * 100)
        if (pct !== lastPrinted && pct % 5 === 0) {
          lastPrinted = pct
          process.stdout.write(`\r⬇️  Baixando... ${pct}% (${formatMb(received)} / ${formatMb(total)} MB)`)
        }
      }
      controller.enqueue(chunk)
    }
  })

  const partialPath = `${destPath}.part`
  try {
    await pipeline(Readable.fromWeb(response.body.pipeThrough(progress)), createWriteStream(partialPath))
    process.stdout.write('\n')
    rmSync(destPath, { force: true })
    renameSync(partialPath, destPath)
  } catch (error) {
    rmSync(partialPath, { force: true })
    throw error
  }
}

function formatMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1)
}

/**
 * Decides which DMG to install: downloads the latest release when nothing is
 * in ~/Downloads or what's there is older; otherwise reuses the local file.
 */
async function resolveDmg() {
  const downloads = downloadsDir()
  const local = findLocalDmg(downloads)
  const installed = findInstalledVersion()

  if (installed) console.log(`ℹ️  Versão instalada em /Applications: ${installed}`)
  if (local) console.log(`📁 Encontrado em ~/Downloads: ${local.name}${local.version ? ` (v${local.version})` : ''}`)

  console.log('🌐 Consultando a última release no GitHub...')
  const latest = await fetchLatestRelease()

  if (!latest) {
    if (!local) {
      fail(
        'Sem acesso ao GitHub e nenhum "Mediacript*.dmg" em ~/Downloads.\n' +
          `Baixe o instalador em https://github.com/${REPO}/releases e rode o comando de novo.`
      )
    }
    console.log('↩️  Usando o arquivo local.')
    return local
  }

  console.log(`🆕 Última release: v${latest.version}`)

  const localIsCurrent =
    local && local.version && compareVersions(local.version, latest.version) >= 0
  if (localIsCurrent) {
    console.log('✔️  O arquivo em ~/Downloads já é a versão mais recente.')
    return local
  }

  const destPath = join(downloads, latest.name)
  if (existsSync(destPath) && statSync(destPath).size === latest.size) {
    console.log('✔️  A versão mais recente já está baixada.')
    return { name: latest.name, fullPath: destPath, version: latest.version }
  }

  console.log(
    local
      ? `⬆️  ~/Downloads tem a v${local.version ?? '?'}; baixando a v${latest.version}...`
      : `⬇️  Baixando ${latest.name} (${formatMb(latest.size)} MB)...`
  )
  await downloadFile(latest.url, destPath, latest.size)
  return { name: latest.name, fullPath: destPath, version: latest.version }
}

function mountDmg(dmgPath) {
  const output = run('hdiutil', ['attach', dmgPath, '-nobrowse', '-noautoopen'])
  const line = output.split('\n').find((l) => l.includes('/Volumes/'))
  if (!line) {
    fail('Não foi possível identificar o ponto de montagem do DMG.')
  }
  return line.slice(line.indexOf('/Volumes/')).trim()
}

function detachDmg(mountPoint) {
  try {
    run('hdiutil', ['detach', mountPoint, '-quiet'])
  } catch {
    try {
      run('hdiutil', ['detach', mountPoint, '-force', '-quiet'])
    } catch {
      console.warn(`⚠️  Não foi possível ejetar ${mountPoint} automaticamente. Ejete manualmente pelo Finder.`)
    }
  }
}

function findAppInVolume(mountPoint) {
  const app = readdirSync(mountPoint).find((name) => name.endsWith('.app'))
  if (!app) {
    fail(`Nenhum arquivo .app encontrado dentro de ${mountPoint}.`)
  }
  return { name: app, fullPath: join(mountPoint, app) }
}

function installApp(sourcePath, destPath) {
  if (existsSync(destPath)) {
    rmSync(destPath, { recursive: true, force: true })
  }
  run('ditto', [sourcePath, destPath])
}

function removeQuarantine(appPath) {
  run('xattr', ['-cr', appPath])
}

export async function runInstallMac() {
  if (process.platform !== 'darwin') {
    fail('Este comando só funciona no macOS.')
  }
  if (typeof fetch !== 'function') {
    fail('Este comando precisa do Node.js 18 ou superior.')
  }

  const dmg = await resolveDmg()
  console.log(`📦 Instalando a partir de: ${dmg.name}`)

  console.log('💿 Montando o DMG...')
  const mountPoint = mountDmg(dmg.fullPath)

  try {
    const app = findAppInVolume(mountPoint)
    const destPath = join(APPLICATIONS_DIR, app.name)

    console.log(`📲 Instalando em ${destPath}...`)
    installApp(app.fullPath, destPath)

    console.log('⏏️  Ejetando o DMG...')
    detachDmg(mountPoint)

    console.log('🔓 Removendo a quarentena do Gatekeeper...')
    removeQuarantine(destPath)

    console.log('🚀 Abrindo o Mediacript...')
    run('open', [destPath])

    console.log(`\n✅ Pronto! O Mediacript${dmg.version ? ` v${dmg.version}` : ''} foi instalado e liberado.`)
  } catch (error) {
    detachDmg(mountPoint)
    throw error
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  runInstallMac().catch((error) => fail(error.message ?? String(error)))
}
