// which anime to test, and the query hayase would send for each
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

import type { SubtitleQuery } from '../../src/lib/types.ts'

export interface Anime {
  id: number
  idMal: number | null
  title: { romaji: string | null, english: string | null, native: string | null, userPreferred: string | null }
  synonyms: string[] | null
  format: string | null
  episodes: number | null
  duration: number | null
  status: string | null
  season: string | null
  seasonYear: number | null
  startDate: { year: number | null, month: number | null, day: number | null } | null
  nextAiringEpisode: { episode: number } | null
  popularity: number | null
  relations: { edges: Array<{ relationType: string | null, node: { id: number, type: string | null } | null } | null> | null } | null
}

interface AniZip {
  mappings?: { anidb_id?: number, mal_id?: number, themoviedb_id?: number | string, kitsu_id?: number, thetvdb_id?: number, imdb_id?: string }
  episodes?: Record<string, { anidbEid?: number, tvdbId?: number, absoluteEpisodeNumber?: number, seasonNumber?: number }>
  episodeCount?: number
}

export const DIR = 'local/reliability'
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const FIELDS = 'id idMal title { romaji english native userPreferred } synonyms format episodes duration status season seasonYear startDate { year month day } nextAiringEpisode { episode } popularity relations { edges { relationType node { id type } } }'
const PAGE = `query ($page: Int, $format: MediaFormat, $ids: [Int], $mal: [Int]) { Page(page: $page, perPage: 50) { pageInfo { hasNextPage } media(type: ANIME, format: $format, id_in: $ids, idMal_in: $mal, isAdult: false, sort: POPULARITY_DESC, status_in: [FINISHED, RELEASING, HIATUS, CANCELLED]) { ${FIELDS} } } }`

// anilist allows 30 a minute when it is busy, so one every 2.1 s
let lastAsked = 0
async function anilist (variables: Record<string, unknown>): Promise<{ hasNextPage: boolean, media: Anime[] }> {
  for (let tries = 0; ; tries++) {
    await sleep(Math.max(0, lastAsked + 2100 - Date.now()))
    lastAsked = Date.now()
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query: PAGE, variables }) })
    if (res.status === 429 && tries < 5) {
      await sleep((Number(res.headers.get('retry-after')) || 60) * 1000)
      continue
    }
    if (!res.ok) throw new Error(`anilist answered ${res.status}`)
    const { data } = await res.json() as { data: { Page: { pageInfo: { hasNextPage: boolean }, media: Anime[] } } }
    return { hasNextPage: data.Page.pageInfo.hasNextPage, media: data.Page.media }
  }
}

async function pages (variables: Record<string, unknown>, max: number): Promise<Anime[]> {
  const found: Anime[] = []
  for (let page = 1; found.length < max; page++) {
    const { hasNextPage, media } = await anilist({ ...variables, page })
    found.push(...media)
    if (!hasNextPage) break
  }
  return found.slice(0, max)
}

// a subtitle page has its anime's slug, and the sitemap lists every one of them
async function subtitlePages (): Promise<Set<string>> {
  const index = await (await fetch('https://miraianime.net/sitemap_index.xml')).text()
  const slugs = new Set<string>()
  for (const [map] of index.matchAll(/https:\/\/miraianime\.net\/subtitle-sitemap\d*\.xml/g)) {
    const xml = await (await fetch(map)).text()
    for (const m of xml.matchAll(/\/subtitle\/([^/<]+)\/<\/loc>/g)) slugs.add(decodeURIComponent(m[1]!).toLowerCase())
    await sleep(500)
  }
  return slugs
}

// mirai lists nearly every anime, which makes it a good list to test the others on too.
// subbed: it has a subtitle page, so mirai itself is tested on it
async function miraiCatalog (): Promise<Array<{ anilist?: number, mal?: number, subbed: boolean }>> {
  const subbed = await subtitlePages()
  const found: Array<{ anilist?: number, mal?: number, subbed: boolean }> = []
  for (let page = 1; ; page++) {
    const res = await fetch(`https://miraianime.net/wp-json/wp/v2/anime?per_page=100&page=${page}&_fields=slug,acf.external_links`)
    // past the last page wordpress answers 400
    if (!res.ok) break
    const rows = await res.json() as Array<{ slug: string, acf?: { external_links?: Record<string, unknown> } }>
    if (!rows.length) break
    for (const row of rows) {
      const links = row.acf?.external_links
      found.push({ anilist: Number(links?.anilist_id) || undefined, mal: Number(links?.my_anime_list_id) || undefined, subbed: subbed.has(decodeURIComponent(row.slug).toLowerCase()) })
    }
    await sleep(1500)
  }
  return found
}

export interface Catalog {
  anime: Anime[]
  // anilist ids mirai has a subtitle page for
  mirai: number[]
}

// the most popular of each format, plus everything mirai lists. kept, so a resumed run tests the same list
export async function catalog (top: Record<string, number>, refresh: boolean): Promise<Catalog> {
  const file = `${DIR}/anime.json`
  if (!refresh && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Catalog

  const all = new Map<number, Anime>()
  for (const [format, count] of Object.entries(top)) {
    console.log(`anilist: the ${count} most popular ${format}`)
    for (const anime of await pages({ format }, count)) all.set(anime.id, anime)
  }
  console.log('mirai: its whole catalog and which of it has subtitles')
  const site = await miraiCatalog()
  const subbedAnilist = new Set(site.filter(e => e.subbed && e.anilist).map(e => e.anilist!))
  const subbedMal = new Set(site.filter(e => e.subbed && !e.anilist && e.mal).map(e => e.mal!))
  const byAnilist = site.flatMap(e => e.anilist ?? [])
  const byMal = site.flatMap(e => !e.anilist && e.mal ? [e.mal] : [])
  const mirai = new Set<number>()
  for (let i = 0; i < byAnilist.length; i += 50) {
    for (const anime of await pages({ ids: byAnilist.slice(i, i + 50) }, 50)) {
      all.set(anime.id, anime)
      if (subbedAnilist.has(anime.id)) mirai.add(anime.id)
    }
  }
  for (let i = 0; i < byMal.length; i += 50) {
    for (const anime of await pages({ mal: byMal.slice(i, i + 50) }, 50)) {
      all.set(anime.id, anime)
      if (anime.idMal && subbedMal.has(anime.idMal)) mirai.add(anime.id)
    }
  }

  const result: Catalog = { anime: [...all.values()], mirai: [...mirai] }
  mkdirSync(DIR, { recursive: true })
  writeFileSync(file, JSON.stringify(result))
  return result
}

// ani.zip, kept a week on disk so a resumed run doesn't ask again
async function aniZip (id: number): Promise<AniZip | undefined> {
  const file = `${DIR}/cache/anizip-${id}.json`
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < 7 * 24 * 3600 * 1000) return JSON.parse(readFileSync(file, 'utf8')) as AniZip | undefined
  const res = await fetch(`https://api.ani.zip/mappings?anilist_id=${id}`)
  const data = res.ok ? await res.json() as AniZip : undefined
  mkdirSync(`${DIR}/cache`, { recursive: true })
  writeFileSync(file, JSON.stringify(data ?? null))
  return data ?? undefined
}

// hayase's createTitles: every title and synonym, plus "S2" for "Season 2" and "2nd Season", plus a copy without dashes
export function titlesOf (anime: Anime): string[] {
  const grouped = [...new Set([...Object.values(anime.title), ...(anime.synonyms ?? [])].filter((name): name is string => !!name && name.length > 3))]
  const titles: string[] = []
  const append = (title: string) => {
    titles.push(title)
    const numbered = /Season (\d)/i.exec(title)
    const ordinal = /(\d)(?:nd|rd|th) Season/i.exec(title)
    if (numbered) titles.push(title.replace(/Season \d/i, `S${numbered[1]}`))
    else if (ordinal) titles.push(title.replace(/(\d)(?:nd|rd|th) Season/i, `S${ordinal[1]}`))
  }
  for (const title of grouped) {
    append(title)
    if (title.includes('-')) append(title.replaceAll('-', ''))
  }
  return titles
}

// hayase looks a special's ids up on its parent when ani.zip has none of its own
function parentOf (anime: Anime): number | undefined {
  if (!['SPECIAL', 'OVA', 'ONA'].includes(anime.format ?? '')) return undefined
  const edges = (anime.relations?.edges ?? []).filter(edge => edge?.node?.type === 'ANIME')
  for (const type of ['PARENT', 'PREQUEL', 'SEQUEL']) {
    const id = edges.find(edge => edge?.relationType === type)?.node?.id
    if (id) return id
  }
}

export interface Prepared {
  // the episodes that are out, so a test never asks for one that isn't
  aired: number
  query: (episode: number, fetchFn: typeof fetch) => SubtitleQuery
}

export async function prepare (anime: Anime): Promise<Prepared> {
  let meta = await aniZip(anime.id)
  if (!meta?.mappings?.anidb_id) {
    const parent = parentOf(anime)
    if (parent) meta = await aniZip(parent) ?? meta
  }
  const out = anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 0
  const count = anime.episodes || Math.max(out, meta?.episodeCount ?? 0) || 1
  const aired = Math.max(1, anime.nextAiringEpisode ? out : count)
  const { anidb_id: anidbAid, mal_id: malId, themoviedb_id: tmdbId, kitsu_id: kitsuId, thetvdb_id: tvdbId, imdb_id: imdbId } = meta?.mappings ?? {}
  const titles = titlesOf(anime)

  return {
    aired,
    query (episode, fetchFn) {
      const known = anidbAid ? meta?.episodes?.[episode] : undefined
      // the same fields hayase's _getQueryOptions fills, the extensions only read some of them
      return {
        anilistId: anime.id,
        episodeCount: count,
        episode,
        anidbAid,
        anidbEid: known?.anidbEid,
        tvdbId,
        tvdbEId: known?.tvdbId,
        malId,
        tmdbId,
        kitsuId,
        imdbId,
        media: anime,
        absoluteEpisodeNumber: known?.absoluteEpisodeNumber,
        titles,
        fetch: fetchFn
      } as SubtitleQuery
    }
  }
}
