import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getConfigDirectory } from 'mediacript'
import { createRunStamp, getFeatureOutputDir } from './outputPaths'
import { buildMediaUrl } from './mediaProtocol'
import { downloadAsset } from './adProjectStore'
import type { FetchedProfile } from './apifyInstagram'
import type {
  AdChatMessage,
  IgPost,
  IgProfile,
  IgProfileAnalysis,
  IgProjectDetail,
  IgProjectSummary
} from '../../shared/types'

/**
 * On-disk shape of an Instagram profile project: one profile, its latest posts,
 * the generated analysis and the creation chat. JSON lives in the config dir;
 * downloaded thumbnails/videos go to Documents/Mediacript/Instagram.
 */
export interface PersistedIgProject {
  id: string
  username: string
  description?: string
  folderPath: string
  profile: IgProfile
  posts: IgPost[]
  analysis?: IgProfileAnalysis
  chat?: AdChatMessage[]
  fetchedAt: string
  createdAt: string
  updatedAt: string
}

function getProjectsDir(): string {
  return path.join(getConfigDirectory(), 'ig-projects')
}

function getProjectFilePath(id: string): string {
  return path.join(getProjectsDir(), `${id}.json`)
}

export function loadProject(id: string): PersistedIgProject {
  const filePath = getProjectFilePath(id)
  if (!fs.existsSync(filePath)) throw new Error('Projeto não encontrado — ele pode ter sido excluído.')
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PersistedIgProject
}

export function saveProject(project: PersistedIgProject): void {
  const dir = getProjectsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  project.updatedAt = new Date().toISOString()
  fs.writeFileSync(getProjectFilePath(project.id), JSON.stringify(project, null, 2), 'utf-8')
}

/** Read-modify-write: transcription runs alongside UI actions, so every mutation re-loads the file. */
export function updateProject(id: string, mutate: (project: PersistedIgProject) => void): PersistedIgProject {
  const project = loadProject(id)
  mutate(project)
  saveProject(project)
  return project
}

export function updatePost(projectId: string, postId: string, patch: Partial<IgPost>): PersistedIgProject {
  return updateProject(projectId, (project) => {
    const post = project.posts.find((entry) => entry.id === postId)
    if (post) Object.assign(post, patch)
  })
}

export function toSummary(project: PersistedIgProject): IgProjectSummary {
  return {
    id: project.id,
    username: project.username,
    name: project.profile.fullName || `@${project.username}`,
    fullName: project.profile.fullName,
    followers: project.profile.followers,
    postsCount: project.posts.length,
    transcribedCount: project.posts.filter((post) => post.transcript).length,
    hasAnalysis: !!project.analysis,
    localProfilePicUrl: project.profile.localProfilePicUrl,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

export function toDetail(project: PersistedIgProject): IgProjectDetail {
  return {
    ...toSummary(project),
    description: project.description,
    profile: project.profile,
    posts: project.posts,
    analysis: project.analysis,
    chat: project.chat ?? [],
    folderPath: project.folderPath,
    fetchedAt: project.fetchedAt
  }
}

export function listProjects(): IgProjectSummary[] {
  try {
    const dir = getProjectsDir()
    if (!fs.existsSync(dir)) return []

    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => toSummary(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) as PersistedIgProject))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  } catch (error) {
    console.error('Error reading Instagram projects:', error)
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

export function videoPath(project: PersistedIgProject, post: IgPost): string {
  return path.join(project.folderPath, `${post.shortCode}_video.mp4`)
}

export function audioPath(project: PersistedIgProject, post: IgPost): string {
  return path.join(project.folderPath, `${post.shortCode}_audio.mp3`)
}

/** Instagram CDN URLs are signed and expire within hours, so thumbnails are pulled to disk right after a scrape. */
async function localize(project: PersistedIgProject, fetched: FetchedProfile): Promise<{ profile: IgProfile; posts: IgPost[] }> {
  const profile: IgProfile = { ...fetched.profile, localProfilePicUrl: project.profile?.localProfilePicUrl }

  const tasks: Promise<void>[] = []

  if (profile.profilePicUrl) {
    const url = profile.profilePicUrl
    tasks.push(
      downloadAsset(url, path.join(project.folderPath, 'profile.jpg'))
        .then((file) => {
          profile.localProfilePicUrl = buildMediaUrl(file)
        })
        .catch((error) => console.warn('Falha ao baixar foto de perfil:', (error as Error).message))
    )
  }

  const posts = fetched.posts.map((post) => ({ ...post }))
  for (const post of posts) {
    if (!post.displayUrl) continue
    const url = post.displayUrl
    tasks.push(
      downloadAsset(url, path.join(project.folderPath, `${post.shortCode}_thumb.jpg`))
        .then((file) => {
          post.localThumbnailUrl = buildMediaUrl(file)
        })
        .catch((error) => console.warn(`Falha ao baixar thumbnail de ${post.shortCode}:`, (error as Error).message))
    )
  }

  await Promise.all(tasks)
  return { profile, posts }
}

export async function createProject(
  input: { username: string; description?: string },
  fetched: FetchedProfile
): Promise<PersistedIgProject> {
  const now = new Date()
  const username = fetched.profile.username || input.username
  const folderPath = path.join(getFeatureOutputDir('instagram'), `${createRunStamp(now)}_${username}`)
  fs.mkdirSync(folderPath, { recursive: true })

  const draft = { folderPath } as PersistedIgProject
  const { profile, posts } = await localize(draft, fetched)

  const project: PersistedIgProject = {
    id: randomUUID(),
    username,
    description: input.description,
    folderPath,
    profile,
    posts,
    fetchedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  }
  saveProject(project)
  return project
}

/**
 * Applies a fresh scrape to an existing project. Transcripts survive by post
 * id (the media URLs are new, the words are not), the analysis and chat stay,
 * and posts that fell out of the latest window are dropped along with their files.
 */
export async function refreshProject(projectId: string, fetched: FetchedProfile): Promise<PersistedIgProject> {
  const project = loadProject(projectId)
  const previous = new Map(project.posts.map((post) => [post.id, post]))
  const { profile, posts } = await localize(project, fetched)

  for (const post of posts) {
    const old = previous.get(post.id)
    if (old?.transcript) post.transcript = old.transcript
  }

  const keep = new Set(posts.map((post) => post.shortCode))
  for (const old of project.posts) {
    if (keep.has(old.shortCode)) continue
    for (const name of fs.existsSync(project.folderPath) ? fs.readdirSync(project.folderPath) : []) {
      if (name.startsWith(`${old.shortCode}_`)) fs.rmSync(path.join(project.folderPath, name), { force: true })
    }
  }

  return updateProject(projectId, (current) => {
    current.profile = profile
    current.posts = posts
    current.fetchedAt = new Date().toISOString()
  })
}
