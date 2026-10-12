import { cache } from './cache.ts'
import { startClock } from './clock.ts'
import { readPicked } from './files.ts'
import { gather } from './gather.ts'
import { getText, HttpError, ORIGIN, request } from './http.ts'
import { label, unique } from './label.ts'
import { parseListing } from './listing.ts'
import { pickFiles } from './names.ts'
import { maxFiles, plan } from './plan.ts'
import { findSlug, slugCache } from './resolve.ts'
import { toLink } from './subtitle.ts'
import { openZip, SkippedEntry } from './zip.ts'

import type { Clock } from './clock.ts'
import type { Block } from './listing.ts'
import type { Read } from './files.ts'
import type { Step } from './plan.ts'
import type { Format } from './subtitle.ts'
import type { Options, SubtitleQuery, SubtitleResult } from './types.ts'
import type { Zip } from './zip.ts'

// what is remembered: the text, the link is made when it is handed over (a blob link does not live forever)
interface Found {
  text: string
  format: Format
  language: string
}

const MINUTE = 60 * 1000
// a zip this small comes whole in one request, a round trip costs more than the extra bytes
const WHOLE = 300 * 1024

const asError = (reason: unknown) => reason instanceof Error ? reason : new Error(String(reason))
const gone = (error: unknown) => error instanceof HttpError && (error.status === 404 || error.status === 410)

// the page gives slugs percent encoded, the rest api gives them plain
const urlSafe = (slug: string) => /%[\da-f]{2}/i.test(slug) ? slug : encodeURIComponent(slug)

// label for each file. when two would match (1080p vs 2160p, two streaming services) the tags only one has,
// then a number
function named (files: Read[], block: Block): Found[] {
  const plain = files.map(f => label(f.file, block, f.format))

  const names = files.map((f, i) => {
    const alike = files.filter((_, j) => plain[j] === plain[i])
    if (alike.length < 2) return plain[i]!
    // tags they all share say nothing, the rest tell them apart
    return label(f.file, block, f.format, f.file.tags.filter(tag => alike.some(other => !other.file.tags.includes(tag))).join(' '))
  })
  return unique(names).map((language, i) => ({ text: files[i]!.text, format: files[i]!.format, language }))
}

// hayase drops a call after 10s, so the default answers before that with what it has
export function createExtension (budget = 8000, grace = 1500, link = toLink) {
  const slugs = slugCache()
  const listings = cache<Block[]>(10 * MINUTE, 64)
  const zips = cache<Zip>(30 * MINUTE, 12)
  const found = cache<Found[]>(30 * MINUTE, 16)

  async function listing (slug: string, fetchFn: typeof fetch, clock: Clock): Promise<Block[]> {
    const known = listings.get(slug)
    if (known) return known

    try {
      return listings.set(slug, parseListing(await getText(fetchFn, `${ORIGIN}/subtitle/${urlSafe(slug)}/`, clock)))
    } catch (error) {
      // the anime is on the site, nobody uploaded subs yet
      if (gone(error)) return listings.set(slug, [], 5 * MINUTE)
      throw error
    }
  }

  async function fromZip ({ block, episodes, lone, span }: Step, query: SubtitleQuery, clock: Clock): Promise<Found[]> {
    const key = `${block.zip}|${episodes.join(',')}`
    const known = found.get(key)
    if (known) return known

    const tail = block.size && block.size <= WHOLE ? Math.ceil(block.size * 1.1) + 1024 : undefined
    const zip = zips.get(block.zip) ?? zips.set(block.zip, await openZip(query.fetch, block.zip, clock, tail))
    const picked = pickFiles(zip.entries.map(e => e.name), episodes, lone, span)

    const reads = await Promise.allSettled(picked.map(file => readPicked(zip, file, clock)))
    const files = reads.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    // too big or locked stays that way, nothing to retry or report
    const failed = reads.find((r): r is PromiseRejectedResult => r.status === 'rejected' && !(r.reason instanceof SkippedEntry))
    if (failed && !files.length) throw asError(failed.reason)

    const results = named(files, block)
    // a failed read may work next time, so only clean runs are cached
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
        // a gone zip is no news, anything else is worth a toast
        const failure = errors.find(error => !gone(error))
        if (failure) throw asError(failure)
      }
      // two zips can end up with the same label
      const names = unique(results.map(r => r.language))
      return results.slice(0, maxFiles(options)).map((r, i) => ({ url: link(r.text, r.format), language: names[i]! }))
    }
  }
}
