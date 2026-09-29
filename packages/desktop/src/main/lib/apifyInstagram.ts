import type { IgPost, IgPostType, IgProfile } from '../../shared/types'

/**
 * Connector for Apify's "Instagram Scraper" actor. One actor, two runs: `details`
 * returns the profile card and `posts` the latest posts. They run in parallel.
 *
 * https://apify.com/apify/instagram-scraper
 *
 * Field names were taken from the actor's docs, not a live call — `pick` accepts
 * the known aliases so a rename in the actor output degrades to a missing field
 * rather than a crash.
 */
const ACTOR_ID = 'apify~instagram-scraper'
const RUN_SYNC_TIMEOUT_SECONDS = 280

type Raw = Record<string, any>

function pick(source: Raw | undefined, ...keys: string[]): any {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  // Instagram hides like counts as -1.
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function toIsoDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const date = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Accepts `@user`, `user` or a full profile URL. */
export function parseUsername(input: string): string {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1]
  const username = (fromUrl ?? trimmed).replace(/^@/, '').replace(/\/+$/, '')
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new Error('Informe um @usuario válido do Instagram.')
  return username.toLowerCase()
}

async function runActor(apiKey: string, input: Record<string, unknown>): Promise<Raw[]> {
  const endpoint =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(apiKey)}&timeout=${RUN_SYNC_TIMEOUT_SECONDS}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((RUN_SYNC_TIMEOUT_SECONDS + 20) * 1000)
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`Apify respondeu ${response.status}: ${detail || response.statusText}`)
  }

  const items = await response.json()
  return Array.isArray(items) ? items : []
}

export function normalizeProfile(raw: Raw, fallbackUsername: string): IgProfile {
  return {
    username: String(pick(raw, 'username') ?? fallbackUsername),
    fullName: pick(raw, 'fullName', 'full_name'),
    biography: pick(raw, 'biography', 'bio'),
    followers: toNumber(pick(raw, 'followersCount', 'followers_count', 'followers')),
    following: toNumber(pick(raw, 'followsCount', 'followingCount', 'follows_count', 'following')),
    postsCount: toNumber(pick(raw, 'postsCount', 'posts_count', 'mediaCount')),
    verified: !!pick(raw, 'verified', 'is_verified'),
    isBusiness: !!pick(raw, 'isBusinessAccount', 'is_business_account'),
    category: pick(raw, 'businessCategoryName', 'categoryName', 'category_name'),
    externalUrl: pick(raw, 'externalUrl', 'external_url'),
    profilePicUrl: pick(raw, 'profilePicUrlHD', 'profilePicUrl', 'profile_pic_url_hd', 'profile_pic_url'),
    isPrivate: !!pick(raw, 'private', 'isPrivate', 'is_private')
  }
}

function detectType(raw: Raw): IgPostType {
  const type = String(pick(raw, 'type') ?? '').toLowerCase()
  const productType = String(pick(raw, 'productType') ?? '').toLowerCase()
  if (productType === 'clips') return 'reel'
  if (type === 'sidecar') return 'carousel'
  if (type === 'video' || pick(raw, 'videoUrl', 'video_url')) return 'video'
  return 'image'
}

export function normalizePost(raw: Raw): IgPost | null {
  const shortCode = String(pick(raw, 'shortCode', 'shortcode', 'code') ?? '')
  const id = String(pick(raw, 'id', 'pk') ?? shortCode)
  if (!id || !shortCode) return null

  const type = detectType(raw)
  const isVideo = type === 'reel' || type === 'video'

  return {
    id,
    shortCode,
    url: String(pick(raw, 'url') ?? `https://www.instagram.com/${type === 'reel' ? 'reel' : 'p'}/${shortCode}/`),
    type,
    caption: String(pick(raw, 'caption') ?? ''),
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.map(String) : [],
    mentions: Array.isArray(raw.mentions) ? raw.mentions.map(String) : [],
    likes: toNumber(pick(raw, 'likesCount', 'likes_count')),
    comments: toNumber(pick(raw, 'commentsCount', 'comments_count')),
    views: isVideo ? toNumber(pick(raw, 'videoPlayCount', 'videoViewCount', 'play_count', 'view_count')) : undefined,
    durationSeconds: isVideo ? toNumber(pick(raw, 'videoDuration', 'video_duration')) : undefined,
    postedAt: toIsoDate(pick(raw, 'timestamp', 'taken_at')),
    displayUrl: pick(raw, 'displayUrl', 'display_url'),
    videoUrl: isVideo ? pick(raw, 'videoUrl', 'video_url') : undefined
  }
}

export interface FetchedProfile {
  profile: IgProfile
  posts: IgPost[]
}

export async function fetchInstagramProfile(usernameInput: string, limit: number, apiKey: string): Promise<FetchedProfile> {
  const username = parseUsername(usernameInput)
  const directUrls = [`https://www.instagram.com/${username}/`]

  const [details, posts] = await Promise.all([
    runActor(apiKey, { directUrls, resultsType: 'details', resultsLimit: 1, searchLimit: 1 }),
    runActor(apiKey, { directUrls, resultsType: 'posts', resultsLimit: limit, searchLimit: 1 })
  ])

  // Profile errors come back as items with an `error` field instead of an HTTP failure.
  const detailItem = details.find((item) => !item.error && pick(item, 'username', 'fullName', 'biography'))
  const postItems = posts.filter((item) => !item.error)

  // Fall back to the posts embedded in the profile item when the posts run came back empty.
  const latestFromDetails: Raw[] = Array.isArray(detailItem?.latestPosts) ? detailItem!.latestPosts : []
  const rawPosts = postItems.length ? postItems : latestFromDetails

  if (!detailItem && !rawPosts.length) {
    const reason = String(details[0]?.errorDescription ?? details[0]?.error ?? posts[0]?.errorDescription ?? '')
    throw new Error(
      reason
        ? `Não foi possível ler o perfil @${username}: ${reason}`
        : `Não foi possível ler o perfil @${username}. Ele pode ser privado, ter sido renomeado ou não existir.`
    )
  }

  const profile = normalizeProfile(detailItem ?? { username }, username)
  if (profile.isPrivate) throw new Error(`O perfil @${username} é privado — só perfis públicos podem ser analisados.`)

  const seen = new Set<string>()
  const normalized: IgPost[] = []
  for (const raw of rawPosts) {
    const post = normalizePost(raw)
    if (!post || seen.has(post.id)) continue
    seen.add(post.id)
    normalized.push(post)
  }

  normalized.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
  return { profile, posts: normalized.slice(0, limit) }
}
