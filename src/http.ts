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

// only ok responses come back, anything else is thrown so callers can't forget to check
export async function request (fetchFn: typeof fetch, url: string, clock: Clock, headers?: Record<string, string>): Promise<Response> {
  const res = await clock.run(fetchFn(url, headers ? { headers } : undefined))
  if (res.ok) return res

  // cloudflare check pages come as 403 or 503 with html, worth a clearer message
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
