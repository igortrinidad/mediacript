import { protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

export const MEDIA_PROTOCOL_SCHEME = 'mediacript-media'

const CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'audio/mpeg'
}

// Must run at module load time (before `app.whenReady()`), which is when
// this file gets imported from `main/index.ts` — Electron requires
// privileged-scheme registration to happen before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_PROTOCOL_SCHEME,
    privileges: {
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

/**
 * Serves local files (e.g. the audio extracted for a highlight chat session)
 * to `<audio>` elements in the renderer, without loading them fully into
 * memory (unlike a data: URL). Range requests are implemented by hand —
 * `net.fetch` on a `file://` URL does NOT reliably honor/forward the
 * incoming Range header, and without real 206/Content-Range support an
 * `<audio>` element's `currentTime` seeks silently fail (they reset to 0
 * instead of landing where requested).
 *
 * The content type comes from the file extension (mp3 by default, plus the
 * mp4/image files the ads analyzer downloads).
 */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_PROTOCOL_SCHEME, async (request) => {
    const filePath = decodeURIComponent(request.url.slice(`${MEDIA_PROTOCOL_SCHEME}:`.length))
    const stat = await fs.promises.stat(filePath)
    const range = request.headers.get('range')

    if (!range) {
      return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
        status: 200,
        headers: {
          'content-type': contentTypeFor(filePath),
          'content-length': String(stat.size),
          'accept-ranges': 'bytes'
        }
      })
    }

    const match = /bytes=(\d*)-(\d*)/.exec(range)
    const start = match?.[1] ? Number(match[1]) : 0
    const end = match?.[2] ? Number(match[2]) : stat.size - 1
    const chunkSize = end - start + 1

    return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream, {
      status: 206,
      headers: {
        'content-type': contentTypeFor(filePath),
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'content-length': String(chunkSize),
        'accept-ranges': 'bytes'
      }
    })
  })
}

/** Builds the URL a renderer `<audio>` element can use directly as `src` to play `filePath`. */
export function buildMediaUrl(filePath: string): string {
  return `${MEDIA_PROTOCOL_SCHEME}:${encodeURIComponent(filePath)}`
}
