import { cache } from './cache.ts'
import { startClock } from './clock.ts'
import { gather } from './gather.ts'
import { getText, HttpError, ORIGIN, request } from './http.ts'
import { label, unique } from './label.ts'
import { parseListing } from './listing.ts'
import { pickFiles } from './names.ts'
import { maxFiles, plan } from './plan.ts'
import { findSlug, slugCache } from './resolve.ts'
import { decodeText, detectFormat, toDataUrl } from './subtitle.ts'
import { openZip } from './zip.ts'

import type { Clock } from './clock.ts'
import type { Block } from './listing.ts'
import type { Picked } from './names.ts'
import type { Step } from './plan.ts'
import type { Format } from './subtitle.ts'
import type { Options, SubtitleQuery, SubtitleResult } from './types.ts'
import type { Zip } from './zip.ts'

const MINUTE = 60 * 1000
// a zip up to this size comes whole with the first request, a round trip costs more than the extra bytes
const WHOLE = 300 * 1024

const asError = (reason: unknown) => reason instanceof Error ? reason : new Error(String(reason))
const gone = (error: unknown) => error instanceof HttpError && (error.status === 404 || error.status === 410)

// a slug with non ascii letters comes percent encoded from the page and plain from the rest api
const urlSafe = (slug: string) => /%[\da-f]{2}/i.test(slug) ? slug : encodeURIComponent(slug)

// names for the files of one zip: the usual label, and where two would be alike (a movie in 1080p
// and in 2160p, say) the leftover tags of the file name, and a number if even those match
function named (files: Array<{ file: Picked, url: string, format: Format }>, block: Block): SubtitleResult[] {
  const plain = files.map(f => label(f.file, block, f.format))
  const twice = new Set(plain.filter((name, i) => plain.indexOf(name) !== i))
  const release = block.release.toLowerCase().split('/')

  const names = files.map((f, i) => twice.has(plain[i]!)
    ? label(f.file, block, f.format, f.file.tags.filter(t => !release.includes(t.toLowerCase())).join(' '))
    : plain[i]!)
  return unique(names).map((language, i) => ({ url: files[i]!.url, language }))
}

// hayase drops a call after 10 seconds without a word, so the default answers before that with what it has
export function createExtension (budget = 8000, grace = 1500) {
  const slugs = slugCache()
  const listings = cache<Block[]>(10 * MINUTE, 64)
  const zips = cache<Zip>(30 * MINUTE, 12)
  const found = cache<SubtitleResult[]>(30 * MINUTE, 16)

  async function listing (slug: string, fetchFn: typeof fetch, clock: Clock): Promise<Block[]> {
    const known = listings.get(slug)
    if (known) return known

    try {
      return listings.set(slug, parseListing(await getText(fetchFn, `${ORIGIN}/subtitle/${urlSafe(slug)}/`, clock)))
    } catch (error) {
      // the anime is on the site but nobody uploaded subtitles for it yet
      if (gone(error)) return listings.set(slug, [], 5 * MINUTE)
      throw error
    }
  }

  // the text decides the format, not the file name
  async function readFile (zip: Zip, path: string, clock: Clock) {
    const text = decodeText(await zip.read(zip.entries.find(e => e.name === path)!, clock))
    const format = detectFormat(text)
    return format && { url: toDataUrl(text, format), format }
  }

  async function fromZip ({ block, episodes, lone }: Step, query: SubtitleQuery, clock: Clock): Promise<SubtitleResult[]> {
    const key = `${block.zip}|${episodes.join(',')}`
    const known = found.get(key)
    if (known) return known

    const tail = block.size && block.size <= WHOLE ? Math.ceil(block.size * 1.1) + 1024 : undefined
    const zip = zips.get(block.zip) ?? zips.set(block.zip, await openZip(query.fetch, block.zip, clock, tail))
    const picked = pickFiles(zip.entries.map(e => e.name), episodes, lone)

    const reads = await Promise.allSettled(picked.map(async file => ({ file, read: await readFile(zip, file.path, clock) })))
    const files = reads.flatMap(r => r.status === 'fulfilled' && r.value.read ? [{ file: r.value.file, ...r.value.read }] : [])
    const failed = reads.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed && !files.length) throw asError(failed.reason)

    const results = named(files, block)
    // a read that failed may work next time, so only a clean run is remembered
    return failed ? results : found.set(key, results)
  }

  return {
    url: ORIGIN,

    async test (): Promise<boolean> {
      const clock = startClock(4000)
      const res = await request(fetch, `${ORIGIN}/wp-json/wp/v2/anime?per_page=1&_fields=id`, clock)
      if (!Array.isArray(await clock.run(res.json()))) throw new Error('mirai answered something unexpected')
      return true
    },

    async single (query: SubtitleQuery, options: Options = {}): Promise<SubtitleResult[]> {
      const clock = startClock(budget)

      const slug = await findSlug(query, clock, slugs)
      if (!slug) return []

      const steps = plan(await listing(slug, query.fetch, clock), query, options)
      const { values: results, errors } = await gather(steps.map(step => fromZip(step, query, clock)), grace)

      if (!results.length) {
        // a zip that is gone is no news, anything else is worth telling the user about
        const failure = errors.find(error => !gone(error))
        if (failure) throw asError(failure)
      }
      // two zips can both end up calling a file the same thing
      const names = unique(results.map(r => r.language))
      return results.slice(0, maxFiles(options)).map((r, i) => ({ ...r, language: names[i]! }))
    }
  }
}
