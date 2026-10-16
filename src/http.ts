import type { Clock } from './clock.ts'

export const ORIGIN = 'https://miraianime.net'

export class HttpError extends Error {
  status: number

  constructor (status: number, url: string) {
    super(`mirai answered ${status} for ${new URL(url).pathname}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export const asError = (reason: unknown) => reason instanceof Error ? reason : new Error(String(reason))

// only ok comes back, anything else throws so nobody forgets to check
export async function request (fetchFn: typeof fetch, url: string, clock: Clock, headers?: Record<string, string>): Promise<Response> {
  const res = await clock.run(fetchFn(url, headers ? { headers } : undefined))
  if (res.ok) return res

  // cloudflare's check page is a 403/503 with html, say so
  const body = res.status === 403 || res.status === 503 ? await clock.run(res.text()).catch(() => '') : ''
  if (/just a moment|challenge-platform|cf-chl/i.test(body)) {
    throw new Error('mirai wants a cloudflare check, open the site once in a browser')
  }
  throw new HttpError(res.status, url)
}

export async function getText (fetchFn: typeof fetch, url: string, clock: Clock): Promise<string> {
  const res = await request(fetchFn, url, clock)
  return await clock.run(res.text())
}

// a page that isn't json (a check or login page can still be a 200) gets a plain message, not a syntax error
export async function getJson (fetchFn: typeof fetch, url: string, clock: Clock): Promise<unknown> {
  const text = await getText(fetchFn, url, clock)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('mirai answered something unexpected')
  }
}
