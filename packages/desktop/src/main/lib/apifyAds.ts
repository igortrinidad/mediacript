import type { AdItem, AdMediaType, AdSearchRequest } from '../../shared/types'

/**
 * Connector for the Apify "Facebook Ads Library Scraper" actor, which returns
 * ads from the Meta Ad Library together with their creative assets (video/image
 * URLs) and whatever KPIs Meta exposes.
 *
 * https://apify.com/apify/facebook-ads-scraper
 */
const ACTOR_ID = 'apify~facebook-ads-scraper'
const RUN_SYNC_TIMEOUT_SECONDS = 280

type Raw = Record<string, any>

/** First non-empty value among `keys` — the actor mixes camelCase and snake_case depending on the field. */
function pick(source: Raw | undefined, ...keys: string[]): any {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

function toIsoDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const date = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function stringifyMaybeRange(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  const range = value as Raw
  const lower = pick(range, 'lower_bound', 'lowerBound', 'lower')
  const upper = pick(range, 'upper_bound', 'upperBound', 'upper')
  if (lower !== undefined && upper !== undefined) return `${lower}–${upper}`
  return pick(range, 'impressionsText', 'text') ?? undefined
}

/** Ad Library search URL for a keyword — the actor accepts these as `startUrls`. */
function buildKeywordUrl(request: AdSearchRequest, keyword: string): string {
  const params = new URLSearchParams({
    active_status: request.activeStatus,
    ad_type: 'all',
    country: request.country || 'ALL',
    q: keyword,
    search_type: 'keyword_unordered',
    media_type: request.mediaType
  })
  return `https://www.facebook.com/ads/library/?${params.toString()}`
}

function buildStartUrls(request: AdSearchRequest): { url: string }[] {
  const urls: string[] = []

  for (const keyword of request.keywords.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean)) {
    urls.push(buildKeywordUrl(request, keyword))
  }
  for (const pageUrl of request.pageUrls.map((u) => u.trim()).filter(Boolean)) {
    urls.push(pageUrl)
  }

  return urls.map((url) => ({ url }))
}

export function normalizeAd(raw: Raw): AdItem | null {
  const snapshot: Raw = raw.snapshot ?? {}
  const id = String(pick(raw, 'adArchiveID', 'adArchiveId', 'ad_archive_id') ?? '')
  if (!id) return null

  const cards: Raw[] = Array.isArray(snapshot.cards) ? snapshot.cards : []
  const videos: Raw[] = [...(Array.isArray(snapshot.videos) ? snapshot.videos : []), ...cards]
  const images: Raw[] = [...(Array.isArray(snapshot.images) ? snapshot.images : []), ...cards]

  const videoSource = videos.find((v) => pick(v, 'video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl'))
  const videoUrl: string | undefined = pick(videoSource, 'video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl')
  const videoPreview: string | undefined = pick(
    videoSource,
    'video_preview_image_url',
    'videoPreviewImageUrl'
  )
  const imageUrl: string | undefined = pick(
    images.find((i) => pick(i, 'original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl')),
    'original_image_url',
    'originalImageUrl',
    'resized_image_url',
    'resizedImageUrl'
  )

  const mediaType: AdMediaType = videoUrl ? 'video' : imageUrl ? 'image' : 'other'

  const body = snapshot.body
  const bodyText: string = typeof body === 'string' ? body : (body?.text ?? '')

  const startDate = toIsoDate(pick(raw, 'startDate', 'start_date', 'startDateFormatted'))
  const endDate = toIsoDate(pick(raw, 'endDate', 'end_date', 'endDateFormatted'))
  const isActive = pick(raw, 'isActive', 'is_active') ?? !endDate
  const daysRunning = startDate
    ? Math.max(0, Math.round(((endDate ? new Date(endDate).getTime() : Date.now()) - new Date(startDate).getTime()) / 86_400_000))
    : undefined

  const platformsRaw = pick(raw, 'publisherPlatform', 'publisher_platform')
  const platforms: string[] = Array.isArray(platformsRaw) ? platformsRaw.map(String) : platformsRaw ? [String(platformsRaw)] : []

  const reach = pick(raw, 'reachEstimate', 'reach_estimate')
  const collation = pick(raw, 'collationCount', 'collation_count')

  return {
    id,
    pageName: String(pick(raw, 'pageName', 'page_name') ?? pick(snapshot, 'page_name', 'pageName') ?? 'Página desconhecida'),
    pageId: pick(raw, 'pageID', 'pageId', 'page_id') ? String(pick(raw, 'pageID', 'pageId', 'page_id')) : undefined,
    mediaType,
    body: bodyText,
    title: pick(snapshot, 'title'),
    ctaText: pick(snapshot, 'cta_text', 'ctaText'),
    linkUrl: pick(snapshot, 'link_url', 'linkUrl'),
    videoUrl,
    imageUrl,
    thumbnailUrl: videoPreview ?? imageUrl,
    libraryUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    kpis: {
      isActive: !!isActive,
      startDate,
      endDate,
      daysRunning,
      variations: typeof collation === 'number' ? collation : collation ? Number(collation) : undefined,
      platforms,
      impressions: stringifyMaybeRange(pick(raw, 'impressionsWithIndex', 'impressions_with_index', 'impressions')),
      reach: typeof reach === 'number' ? reach : undefined,
      spend: stringifyMaybeRange(pick(raw, 'spend'))
    }
  }
}

/**
 * Runs the actor synchronously and returns the normalized ads. The sync
 * endpoint holds the connection until the run finishes (Apify caps it at ~5
 * minutes), which is fine for the small `limit`s this POC uses — an async
 * run + polling would be the next step for bigger pulls.
 */
export async function searchAds(request: AdSearchRequest, apiKey: string): Promise<AdItem[]> {
  const startUrls = buildStartUrls(request)
  if (!startUrls.length) throw new Error('Informe ao menos uma palavra-chave ou uma página para buscar.')

  const endpoint =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(apiKey)}&timeout=${RUN_SYNC_TIMEOUT_SECONDS}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUrls, resultsLimit: request.limit }),
    signal: AbortSignal.timeout((RUN_SYNC_TIMEOUT_SECONDS + 20) * 1000)
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`Apify respondeu ${response.status}: ${detail || response.statusText}`)
  }

  const items = (await response.json()) as Raw[]
  const seen = new Set<string>()
  const ads: AdItem[] = []

  for (const raw of Array.isArray(items) ? items : []) {
    const ad = normalizeAd(raw)
    if (!ad || seen.has(ad.id)) continue
    // Page URLs can't carry the media filter, so it is enforced here as well.
    if (request.mediaType !== 'all' && ad.mediaType !== request.mediaType) continue
    seen.add(ad.id)
    ads.push(ad)
  }

  return ads.slice(0, request.limit * startUrls.length)
}
