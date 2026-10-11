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

// null is a real answer too: the site does not have this anime, no need to ask again for a while
export type Slugs = Cache<string | null>
export const slugCache = (): Slugs => cache(DAY, 256)

const LINK = /href="https:\/\/miraianime\.net\/anime\/([^"/]+)\/"/g
const idOf = (value: unknown) => Number(value) || undefined

// letters and digits only, so "Gintama°: Foo" and "gintama foo" meet
export const squash = (title: string) => title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')

// the archive has a filter on the myanimelist id, an unknown id gives an empty list.
// exact, but it is the slow one, the site builds a whole page for it
async function byMal (fetchFn: typeof fetch, mal: number, clock: Clock): Promise<string[]> {
  const html = await getText(fetchFn, `${ORIGIN}/anime/?my_anime_list_ID=${mal}&submit=`, clock)
  return [...new Set([...html.matchAll(LINK)].map(m => m[1]!))]
}

async function rest (fetchFn: typeof fetch, params: string, clock: Clock): Promise<RestAnime[]> {
  const data: unknown = JSON.parse(await getText(fetchFn, `${ORIGIN}/wp-json/wp/v2/anime?${params}&_fields=slug,title,acf.external_links`, clock))
  return Array.isArray(data) ? data as RestAnime[] : []
}

const search = (fetchFn: typeof fetch, term: string, clock: Clock) => rest(fetchFn, `search=${encodeURIComponent(term)}&per_page=10`, clock)

// the rest search only looks at the post title, which is the romaji one, and only latin letters work
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

// ids are exact, they win over any title
function byIds (candidates: RestAnime[], query: SubtitleQuery, mal?: number): string | undefined {
  return candidates.find(c => {
    const links = c.acf?.external_links
    return idOf(links?.anilist_id) === query.anilistId ||
      (mal !== undefined && idOf(links?.my_anime_list_id) === mal) ||
      (!!query.anidbAid && idOf(links?.anidb_id) === query.anidbAid)
  })?.slug
}

// no ids to compare, so the title has to match as a whole, and only when one candidate does
function byTitle (candidates: RestAnime[], query: SubtitleQuery): string | undefined {
  const wanted = new Set(query.titles.map(squash))
  const same = candidates.filter(c => wanted.has(squash(decodeEntities(c.title?.rendered ?? ''))))
  return same.length === 1 ? same[0]!.slug : undefined
}

// the first lookup that finds something wins and the others are left to finish on their own.
// a miss or a failure of one does not stop the rest, a failure only counts when nobody found anything
// (and then the first lookup in the list is the one that gets to explain)
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

// the site's slugs are not guessable (gintama is /gintama/ but the 2011 one is /gintama-2/), so ask it
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
      // two entries on the site share the id, the ids on their pages tell which one is ours
      const rows = await Promise.all(hits.map(slug => rest(fetchFn, `slug=${encodeURIComponent(slug)}`, clock)))
      return byIds(rows.flat(), query, mal) ?? hits[0]
    }))
  }
  // quick, one small json, and it answers first for most anime. the filter above is there for the rest
  let first: RestAnime[] = []
  if (terms[0]) {
    lookups.push(search(fetchFn, terms[0], clock).then(rows => {
      first = rows
      return byIds(rows, query, mal)
    }))
  }

  let found = await firstFound(lookups)

  // last resort: a title match where the site has no ids to offer, then the other titles
  found ??= byTitle(first, query)
  for (const term of terms.slice(1)) {
    if (found) break
    const rows = await search(fetchFn, term, clock)
    found = byIds(rows, query, mal) ?? byTitle(rows, query)
  }

  // a miss is remembered shorter, the site may add the anime tomorrow
  return slugs.set(key, found ?? null, found ? DAY : 10 * 60 * 1000) ?? undefined
}
