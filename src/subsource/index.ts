import { answer, maxFiles } from '../lib/answer.ts'
import { cache } from '../lib/cache.ts'
import { DAY, startClock } from '../lib/clock.ts'
import { episodeOf } from '../lib/episode.ts'
import { unpack } from '../lib/files.ts'
import { api, reachable } from '../lib/http.ts'
import { batchOf, describe } from '../lib/names.ts'

import type { Options, SubtitleQuery, SubtitleResult } from '../lib/types.ts'

interface Show {
  movieId?: number
  title?: string
  type?: string
  season?: number | null
}

interface Subtitle {
  subtitleId?: number
  releaseInfo?: string[] | string
  contributors?: Array<{ displayname?: string }>
}

const squash = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// a pack serves every episode of its season, so the next episode needs no download.
// packs with fonts inside run to 30 MB, too much to hold on a phone
const downloads = cache<Uint8Array>(DAY, 16)
const KEEP = 2 * 1024 * 1024

export default new class SubSource {
  url = 'https://api.subsource.net'

  async single (query: SubtitleQuery, options: Options = {}): Promise<SubtitleResult[]> {
    const key = String(options.subsourceKey ?? '').trim()
    if (!key) return []

    const clock = startClock(8000, 'SubSource')
    const base = `${this.url}/api/v1`
    const headers = { 'X-API-Key': key }
    const { movie, season, numbers, imdb } = await episodeOf(query, clock)

    const search = imdb ? `searchType=imdb&imdb=${encodeURIComponent(imdb)}` : `searchType=text&q=${encodeURIComponent(query.titles[0] ?? '')}`
    const titles = new Set(query.titles.map(squash))
    const find = async (want?: number) => {
      const found = await api(query.fetch, `${base}/movies/search?${search}&type=${movie ? 'movie' : 'series'}${want === undefined ? '' : `&season=${want}`}`, clock, headers)
      const { data: shows = [] } = found ? await clock.run(found.json()) as { data?: Show[] } : {}
      // a text search also finds shows with similar names
      return shows.find(s => typeof s.movieId === 'number' &&
        (movie ? s.type === 'movie' : s.type !== 'movie' && (s.season ?? want) === want) &&
        (imdb || titles.has(squash(s.title ?? ''))))
    }
    // some shows are on the site as one season 0 that has every episode (hunter x hunter 1999)
    const show = movie ? await find() : await find(season) ?? await find(0)
    if (!show) return []

    const listed = await api(query.fetch, `${base}/subtitles?movieId=${show.movieId}&language=arabic&limit=100&sort=popular`, clock, headers)
    const { data: subtitles = [] } = listed ? await clock.run(listed.json()) as { data?: Subtitle[] } : {}
    const any = movie || query.episodeCount === 1
    // what a release name says: this episode, a pack with it (a run of episodes, or no number at all), or another episode
    const kindOf = (name: string) => {
      const batch = batchOf(name)
      const range = batch ?? describe(`${name}.srt`)?.episodes
      if (!range) return 'pack'
      if (!numbers.some(n => n !== undefined && n >= range[0] && n <= range[1])) return 'other'
      return batch ? 'pack' : 'one'
    }
    const year = query.media?.startDate?.year ?? query.media?.seasonYear
    // a release that only names another year is another show (hunter x hunter 2011 filed under the 1999 one)
    const elsewhere = (name: string) => {
      const years = [...name.matchAll(/(?:^|[^\dx])((?:19|20)\d\d)(?![\dxp])/gi)].map(m => Number(m[1]))
      return !!year && years.length > 0 && years.every(y => Math.abs(y - year) > 1)
    }
    const picked = subtitles.flatMap(subtitle => {
      const names = [subtitle.releaseInfo ?? []].flat()
      const kinds = names.map(kindOf)
      const kind = any || kinds.includes('one') ? 'one' : kinds.includes('other') ? undefined : kinds[0]
      if (typeof subtitle.subtitleId !== 'number' || !kind || (names.length && names.every(elsewhere))) return []
      return [{ id: subtitle.subtitleId, release: names[any ? 0 : kinds.indexOf(kind)] ?? '', pack: kind === 'pack', who: subtitle.contributors?.[0]?.displayname }]
    })
    // packs first, the site's popular order otherwise. singles still get their turn, a pack can hold nothing for this episode
    const take = maxFiles(options) + 2
    const chosen = [...picked.filter(p => p.pack).slice(0, take), ...picked.filter(p => !p.pack).slice(0, take)]

    return await answer(chosen.map(async ({ id, release, pack, who }) => {
      let bytes = downloads.get(String(id))
      if (!bytes) {
        const res = await api(query.fetch, `${base}/subtitles/${id}/download`, clock, headers)
        if (!res) return []
        bytes = new Uint8Array(await clock.run(res.arrayBuffer()))
        if (bytes.length <= KEEP) downloads.set(String(id), bytes)
      }
      const files = await unpack(bytes, numbers, !pack, clock)
      // a pack's track is named after the episode's file, not the whole season
      return files.map(({ text, format, name }) => ({ text, format, who: who || 'SubSource', release: pack && name ? name : release }))
    }), query, options)
  }

  test () {
    return reachable(this.url)
  }
}()
