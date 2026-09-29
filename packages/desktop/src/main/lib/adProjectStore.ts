import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getConfigDirectory } from 'mediacript'
import { createRunStamp, getFeatureOutputDir } from './outputPaths'
import { buildMediaUrl } from './mediaProtocol'
import type { AdChatMessage, AdItem, AdProjectDetail, AdProjectSummary, SavedAd } from '../../shared/types'

/**
 * On-disk shape of an ads project. Like meetings, the JSON lives in the config
 * dir while downloaded assets (thumbnails, videos) go to a user-visible folder
 * under Documents/Mediacript/Ads.
 */
export interface PersistedAdProject {
  id: string
  name: string
  description?: string
  folderPath: string
  ads: SavedAd[]
  /** Absent on projects created before the chat existed. */
  chat?: AdChatMessage[]
  createdAt: string
  updatedAt: string
}

function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'projeto'
}

function getProjectsDir(): string {
  return path.join(getConfigDirectory(), 'ad-projects')
}

function getProjectFilePath(id: string): string {
  return path.join(getProjectsDir(), `${id}.json`)
}

export function createProject(input: { name: string; description?: string }): PersistedAdProject {
  const now = new Date()
  const folderPath = path.join(getFeatureOutputDir('ads'), `${createRunStamp(now)}_${slugify(input.name)}`)
  fs.mkdirSync(folderPath, { recursive: true })

  const project: PersistedAdProject = {
    id: randomUUID(),
    name: input.name,
    description: input.description,
    folderPath,
    ads: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  }
  saveProject(project)
  return project
}

export function loadProject(id: string): PersistedAdProject {
  const filePath = getProjectFilePath(id)
  if (!fs.existsSync(filePath)) {
    throw new Error('Projeto não encontrado — ele pode ter sido excluído.')
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PersistedAdProject
}

export function saveProject(project: PersistedAdProject): void {
  const dir = getProjectsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  project.updatedAt = new Date().toISOString()
  fs.writeFileSync(getProjectFilePath(project.id), JSON.stringify(project, null, 2), 'utf-8')
}

/**
 * Read-modify-write on a project. Analyses run concurrently with saves/removes
 * from the UI, so every mutation re-loads the file instead of holding a stale copy.
 */
export function updateProject(id: string, mutate: (project: PersistedAdProject) => void): PersistedAdProject {
  const project = loadProject(id)
  mutate(project)
  saveProject(project)
  return project
}

export function updateAd(projectId: string, adId: string, patch: Partial<SavedAd>): PersistedAdProject {
  return updateProject(projectId, (project) => {
    const ad = project.ads.find((entry) => entry.id === adId)
    if (ad) Object.assign(ad, patch)
  })
}

export function toSummary(project: PersistedAdProject): AdProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    adsCount: project.ads.length,
    analyzedCount: project.ads.filter((ad) => ad.status === 'analyzed').length,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

export function toDetail(project: PersistedAdProject): AdProjectDetail {
  return { ...toSummary(project), ads: project.ads, chat: project.chat ?? [], folderPath: project.folderPath }
}

export function listProjects(): AdProjectSummary[] {
  try {
    const dir = getProjectsDir()
    if (!fs.existsSync(dir)) return []

    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => toSummary(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) as PersistedAdProject))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  } catch (error) {
    console.error('Error reading ad projects:', error)
    return []
  }
}

export function deleteProject(id: string, removeFiles: boolean): void {
  let folderPath: string | null = null
  try {
    folderPath = loadProject(id).folderPath
  } catch {
    // Metadata already gone — just make sure the file is removed below.
  }

  const filePath = getProjectFilePath(id)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

  if (removeFiles && folderPath && fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true })
  }
}

// --- Assets ---------------------------------------------------------------------

/** Downloads `url` to `destPath` (skipped if it already exists). Ad CDN URLs are signed and expire, so callers grab what they need early. */
export async function downloadAsset(url: string, destPath: string): Promise<string> {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) return destPath

  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok) {
    throw new Error(`Não foi possível baixar o arquivo do anúncio (${response.status}). O link pode ter expirado — busque o anúncio de novo.`)
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, Buffer.from(await response.arrayBuffer()))
  return destPath
}

function extensionFor(url: string, fallback: string): string {
  const ext = path.extname(new URL(url).pathname).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext) ? ext : fallback
}

export function assetPath(project: PersistedAdProject, adId: string, kind: 'thumb' | 'video' | 'image', url: string): string {
  const ext = kind === 'video' ? '.mp4' : extensionFor(url, '.jpg')
  return path.join(project.folderPath, `${adId}_${kind}${ext}`)
}

/** Adds an ad to a project (no-op if it is already there) and pulls its thumbnail to disk. */
export async function saveAdToProject(projectId: string, ad: AdItem): Promise<PersistedAdProject> {
  const project = loadProject(projectId)
  if (project.ads.some((entry) => entry.id === ad.id)) return project

  let localThumbnailUrl: string | undefined
  if (ad.thumbnailUrl) {
    try {
      const file = await downloadAsset(ad.thumbnailUrl, assetPath(project, ad.id, 'thumb', ad.thumbnailUrl))
      localThumbnailUrl = buildMediaUrl(file)
    } catch (error) {
      // The card falls back to the remote URL; analysis re-tries the download.
      console.warn('Falha ao baixar thumbnail do anúncio:', (error as Error).message)
    }
  }

  return updateProject(projectId, (current) => {
    if (current.ads.some((entry) => entry.id === ad.id)) return
    current.ads.unshift({ ...ad, savedAt: new Date().toISOString(), status: 'saved', localThumbnailUrl })
  })
}

export function removeAdFromProject(projectId: string, adId: string): PersistedAdProject {
  const project = loadProject(projectId)

  for (const name of fs.existsSync(project.folderPath) ? fs.readdirSync(project.folderPath) : []) {
    if (name.startsWith(`${adId}_`)) fs.rmSync(path.join(project.folderPath, name), { force: true })
  }

  return updateProject(projectId, (current) => {
    current.ads = current.ads.filter((ad) => ad.id !== adId)
  })
}
