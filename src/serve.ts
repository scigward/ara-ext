// hayase's web app only lets fetch reach https, not data: or blob:, and a zip member has no address of its own.
// so a tiny server (worker/) unzips it on request, this is how its links are made
export const SERVER = 'https://mirai-subs.mirai-ext.workers.dev'

export function serveUrl (server: string, zip: string, file: string, inner?: string): string {
  const url = new URL('/sub', server)
  url.searchParams.set('zip', zip)
  url.searchParams.set('file', file)
  if (inner) url.searchParams.set('in', inner)
  return url.href
}
