import { ORIGIN } from './http.ts'

export interface Block {
  // episode ranges the page lists, empty if it says nothing or something odd
  episodes: Array<[number, number]>
  release: string
  translators: string[]
  zip: string
  // about what the page says the zip weighs, in bytes
  size?: number
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities (text: string): string {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (all, dec?: string, hex?: string, name?: string) => {
    if (name) return NAMED[name.toLowerCase()] ?? all
    const code = Number.parseInt((dec ?? hex)!, dec ? 10 : 16)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all
  })
}

const plain = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

// it's an arabic site, a badge could use arabic digits
const asciiDigits = (text: string) => text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))

const UNITS: Record<string, number> = { كيلو: 1024, ميجا: 1024 ** 2, جيجا: 1024 ** 3 }

// كيلوبايت is kilobytes, ميجابايت megabytes, جيجابايت gigabytes
export function parseSize (text: string): number | undefined {
  const m = /^([\d.]+)\s*(كيلو|ميجا|جيجا)?\s*بايت$/.exec(asciiDigits(text).replace(/\s+/g, ' ').trim())
  return m && Number.isFinite(Number(m[1])) ? Math.round(Number(m[1]) * (UNITS[m[2] ?? ''] ?? 1)) : undefined
}

// one episode is one badge, a range is badge إلى badge
function parseEpisodes (cell: string): Array<[number, number]> {
  const badges = [...cell.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(m => asciiDigits(m[1]!).trim())
  if (!badges.length || !badges.every(b => /^\d{1,5}$/.test(b))) return []

  const numbers = badges.map(Number)
  if (cell.includes('إلى') && numbers.length === 2) return [[Math.min(...numbers), Math.max(...numbers)]]
  return numbers.map(n => [n, n])
}

// a block can also link a fonts pack or a rar mirror somewhere else, skip those
function zipLink (hrefs: string[]): string | undefined {
  for (const href of hrefs) {
    try {
      const url = new URL(decodeEntities(href), ORIGIN)
      if (!/^(www\.)?miraianime\.net$/.test(url.hostname)) continue
      if (!url.pathname.startsWith('/wp-content/uploads/') || !/\.zip$/i.test(url.pathname)) continue
      return `${ORIGIN}${url.pathname}${url.search}`
    } catch {
      // not a real url, try the next one
    }
  }
}

const BLOCK = /<div class="entry fansub-details">([\s\S]*?)<\/table>\s*<\/div>\s*<div class="links-file">([\s\S]*?)<\/div>/g
const ROW = /<tr>\s*<th>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g

// one block per zip on /subtitle/<slug>/. no dom in a worker, so regex
export function parseListing (html: string): Block[] {
  const blocks: Block[] = []

  for (const [, info, links] of html.matchAll(BLOCK)) {
    const block: Block = { episodes: [], release: '', translators: [], zip: '' }
    let missing = false
    let size: number | undefined

    for (const [, th, td] of info!.matchAll(ROW)) {
      const label = plain(th!)
      if (label.includes('الحلقات')) block.episodes = parseEpisodes(td!)
      else if (label.includes('صدار')) block.release = [...td!.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(m => plain(m[1]!)).filter(Boolean).join('/')
      else if (label.includes('المترجم')) block.translators = [...td!.matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map(m => plain(m[1]!)).filter(Boolean)
      // the size cell says when the file is gone
      else if (label.includes('حجم')) {
        missing = plain(td!).includes('غير موجود')
        size = parseSize(plain(td!))
      }
    }

    const zip = zipLink([...links!.matchAll(/href="([^"]*)"/g)].map(m => m[1]!))
    if (zip && !missing) blocks.push({ ...block, zip, size })
  }

  return blocks
}

export function covers (block: Block, episode: number): boolean {
  return block.episodes.some(([from, to]) => episode >= from && episode <= to)
}
