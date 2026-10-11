import { cache } from './cache.ts'
import { getText, ORIGIN } from './http.ts'
import { decodeEntities } from './listing.ts'

import type { Cache } from './cache.ts'
import type { Clock } from './clock.ts'
import type { SubtitleQuery } from './types.ts'

interface RestAnime {
  slug: string
  title?: { rendered?: string }
  acf?: { external_links?: Record<string, unknown> }
}

const DAY = 24 * 60 * 60 * 1000

// null counts as an answer: the site doesn't have it, don't ask again for a while
export type Slugs = Cache<string | null>
export const slugCache = (): Slugs => cache(DAY, 256)

const LINK = /href="https:\/\/miraianime\.net\/anime\/([^"/]+)\/"/g
const idOf = (value: unknown) => Number(value) || undefined

// letters and digits only, so "gintama°: foo" meets "gintama foo"
export const squash = (title: string) => title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')

// the archive filters by mal id (an unknown id gives an empty list). exact but slow, it builds a whole page
async function byMal (fetchFn: typeof fetch, mal: number, clock: Clock): Promise<string[]> {
  const html = await getText(fetchFn, `${ORIGIN}/anime/?my_anime_list_ID=${mal}&submit=`, clock)
  return [...new Set([...html.matchAll(LINK)].map(m => m[1]!))]
}

async function rest (fetchFn: typeof fetch, params: string, clock: Clock): Promise<RestAnime[]> {
  const data: unknown = JSON.parse(await getText(fetchFn, `${ORIGIN}/wp-json/wp/v2/anime?${params}&_fields=slug,title,acf.external_links`, clock))
  return Array.isArray(data) ? data as RestAnime[] : []
}

const search = (fetchFn: typeof fetch, term: string, clock: Clock) => rest(fetchFn, `search=${encodeURIComponent(term)}&per_page=10`, clock)

// rest search only reads the post title (romaji) and only copes with latin letters
function searchTerms (titles: string[]): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const title of titles) {
    const key = squash(title)
    if (!key || seen.has(key) || /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(title)) continue
    seen.add(key)
    terms.push(title)
  }
  return terms.slice(0, 4)
}

// ids are exact, they beat any title. the candidate that agrees on the most ids wins.
// strict: when we have a mal id the site's mal id has to agree too, an anilist id alone has been
// seen on the wrong entry (a special that carries its series' id)
function byIds (candidates: RestAnime[], query: SubtitleQuery, mal: number | undefined, strict: boolean): string | undefined {
  let best: { slug: string, score: number } | undefined

  for (const c of candidates) {
    const links = c.acf?.external_links
    const anilist = idOf(links?.anilist_id) === query.anilistId
    const myanimelist = mal !== undefined && idOf(links?.my_anime_list_id) === mal
    const anidb = !!query.anidbAid && idOf(links?.anidb_id) === query.anidbAid

    const score = Number(anilist) + Number(myanimelist) + Number(anidb)
    if (!score || (strict && mal !== undefined && !myanimelist)) continue
    if (!best || score > best.score) best = { slug: c.slug, score }
  }
  return best?.slug
}

// no ids to compare: the whole title has to match, and only one candidate may
function byTitle (candidates: RestAnime[], query: SubtitleQuery): string | undefined {
  const wanted = new Set(query.titles.map(squash))
  const same = candidates.filter(c => wanted.has(squash(decodeEntities(c.title?.rendered ?? ''))))
  return same.length === 1 ? same[0]!.slug : undefined
}

// first lookup to find something wins, the others finish on their own. a miss or an error in one doesn't stop the rest
// (if nobody finds anything the first lookup's error is the one reported)
function firstFound (lookups: Array<Promise<string | undefined>>): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    let open = lookups.length
    const failures: unknown[] = []
    if (!open) resolve(undefined)

    lookups.forEach((lookup, i) => {
      lookup
        .then(slug => { if (slug !== undefined) resolve(slug) }, (error: unknown) => { failures[i] = error ?? new Error('lookup failed') })
        .finally(() => {
          if (--open) return
          const failure = failures.find(Boolean)
          if (!failure) resolve(undefined)
          else reject(failure instanceof Error ? failure : new Error(String(failure)))
        })
    })
  })
}

// slugs can't be guessed (gintama is /gintama/, the 2011 one is /gintama-2/), so we ask
export async function findSlug (query: SubtitleQuery, clock: Clock, slugs: Slugs): Promise<string | undefined> {
  const key = String(query.anilistId)
  const known = slugs.get(key)
  if (known !== undefined) return known ?? undefined

  const { fetch: fetchFn } = query
  const mal = idOf(query.malId) ?? idOf(query.media?.idMal)
  const terms = searchTerms(query.titles)

  const lookups: Array<Promise<string | undefined>> = []
  if (mal) {
    lookups.push(byMal(fetchFn, mal, clock).then(async hits => {
      if (hits.length < 2) return hits[0]
      // two entries share the id, the ids on their pages say which one is ours
      const rows = await Promise.all(hits.map(slug => rest(fetchFn, `slug=${encodeURIComponent(slug)}`, clock)))
      return byIds(rows.flat(), query, mal, false) ?? hits[0]
    }))
  }
  // quick and small, usually wins. the filter above covers the rest
  let first: RestAnime[] = []
  if (terms[0]) {
    lookups.push(search(fetchFn, terms[0], clock).then(rows => {
      first = rows
      return byIds(rows, query, mal, true)
    }))
  }

  let found = await firstFound(lookups)

  // last resort: title match (the site has no ids for it), then the other titles
  found ??= byIds(first, query, mal, false) ?? byTitle(first, query)
  for (const term of terms.slice(1)) {
    if (found) break
    const rows = await search(fetchFn, term, clock)
    found = byIds(rows, query, mal, false) ?? byTitle(rows, query)
  }

  // misses are remembered shorter, the site may add it tomorrow
  return slugs.set(key, found ?? null, found ? DAY : 10 * 60 * 1000) ?? undefined
}
