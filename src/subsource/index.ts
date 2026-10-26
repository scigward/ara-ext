import { answer, maxFiles } from '../lib/answer.ts'
import { startClock } from '../lib/clock.ts'
import { episodeOf } from '../lib/episode.ts'
import { unpack } from '../lib/files.ts'
import { api, reachable } from '../lib/http.ts'
import { describe } from '../lib/names.ts'

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

export default new class SubSource {
  url = 'https://api.subsource.net'

  async single (query: SubtitleQuery, options: Options = {}): Promise<SubtitleResult[]> {
    const key = String(options.subsourceKey ?? '').trim()
    if (!key) return []

    const clock = startClock(8000, 'SubSource')
    const base = `${this.url}/api/v1`
    const headers = { 'X-API-Key': key }
    const { movie, season, numbers } = await episodeOf(query, clock)

    const search = query.imdbId ? `searchType=imdb&imdb=${encodeURIComponent(query.imdbId)}` : `searchType=text&q=${encodeURIComponent(query.titles[0] ?? '')}`
    const found = await api(query.fetch, `${base}/movies/search?${search}&type=${movie ? 'movie' : 'series'}${movie ? '' : `&season=${season}`}`, clock, headers)
    const { data: shows = [] } = found ? await clock.run(found.json()) as { data?: Show[] } : {}
    const titles = new Set(query.titles.map(squash))
    // a text search also finds shows with similar names
    const show = shows.find(s => typeof s.movieId === 'number' &&
      (movie ? s.type === 'movie' : s.type !== 'movie' && (s.season ?? season) === season) &&
      (query.imdbId || titles.has(squash(s.title ?? ''))))
    if (!show) return []

    const listed = await api(query.fetch, `${base}/subtitles?movieId=${show.movieId}&language=arabic&limit=100&sort=popular`, clock, headers)
    const { data: subtitles = [] } = listed ? await clock.run(listed.json()) as { data?: Subtitle[] } : {}
    const any = movie || query.episodeCount === 1
    const fits = (name: string) => {
      const range = describe(`${name}.srt`)?.episodes
      return !!range && numbers.some(n => n !== undefined && n >= range[0] && n <= range[1])
    }
    const picked = subtitles.flatMap(subtitle => {
      const names = [subtitle.releaseInfo ?? []].flat()
      const release = any ? names[0] ?? '' : names.find(fits)
      return typeof subtitle.subtitleId === 'number' && release !== undefined ? [{ id: subtitle.subtitleId, release, who: subtitle.contributors?.[0]?.displayname }] : []
    })

    return await answer(picked.slice(0, maxFiles(options) + 2).map(async ({ id, release, who }) => {
      const res = await api(query.fetch, `${base}/subtitles/${id}/download`, clock, headers)
      if (!res) return []
      const files = await unpack(new Uint8Array(await clock.run(res.arrayBuffer())), numbers, true, clock)
      return files.map(file => ({ ...file, who: who || 'SubSource', release }))
    }), query, options)
  }

  test () {
    return reachable(this.url)
  }
}()
