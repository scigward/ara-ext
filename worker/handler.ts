// the unzip server. hayase's web app can only fetch https links, a file inside a zip has none,
// so the extension hands out links to this: /sub?zip=<zip on the site>&file=<path in it>[&in=<path in the zip inside it>]
import { startClock } from '../src/clock.ts'
import { HttpError } from '../src/http.ts'
import { decodeText } from '../src/subtitle.ts'
import { openZip, SkippedEntry, zipFromBytes } from '../src/zip.ts'

// the site's uploads and nothing else, or this would be a free proxy for anybody
const ZIPS = /^https:\/\/miraianime\.net\/wp-content\/uploads\/[^?#\s]+\.zip$/i
const LIMIT = 512

function reply (body: string | null, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      ...extra
    }
  })
}

export async function handle (request: Request, fetchFn: typeof fetch): Promise<Response> {
  if (request.method === 'OPTIONS') return reply(null, 204)
  if (request.method !== 'GET' && request.method !== 'HEAD') return reply('use get', 405)

  const url = new URL(request.url)
  if (url.pathname !== '/sub') return reply(url.pathname === '/' ? 'mirai-ext unzip server' : 'nothing here', url.pathname === '/' ? 200 : 404)

  const zip = url.searchParams.get('zip') ?? ''
  const file = url.searchParams.get('file') ?? ''
  const inner = url.searchParams.get('in') ?? ''
  if (!ZIPS.test(zip) || !file || file.length > LIMIT || inner.length > LIMIT) return reply('that is not a zip of the site', 400)

  try {
    const clock = startClock(20_000)
    const opened = await openZip(fetchFn, zip, clock)
    const entry = opened.entries.find(e => e.name === file)
    if (!entry) return reply('no such file in that zip', 404)
    let bytes = await opened.read(entry, clock)

    if (inner) {
      const nested = await zipFromBytes(bytes)
      const wanted = nested.entries.find(e => e.name === inner)
      if (!wanted) return reply('no such file in that zip', 404)
      bytes = await nested.read(wanted, clock)
    }

    // a day is plenty, the zips on the site never change under the same name
    return reply(request.method === 'HEAD' ? null : decodeText(bytes), 200, { 'cache-control': 'public, max-age=86400' })
  } catch (error) {
    if (error instanceof SkippedEntry) return reply('that file is not worth opening', 422)
    if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return reply('that zip is gone', 404)
    return reply('could not read that zip', 502)
  }
}
