import { answer, maxFiles } from '../lib/answer.ts'
import { startClock } from '../lib/clock.ts'
import { episodeOf } from '../lib/episode.ts'
import { unpack } from '../lib/files.ts'
import { api, reachable, request } from '../lib/http.ts'

import type { Options, SubtitleQuery, SubtitleResult } from '../lib/types.ts'

interface Item {
  release_name?: string
  author?: string
  url?: string
  season?: number
  full_season?: boolean
}

export default new class SubDL {
  url = 'https://api.subdl.com'

  async single (query: SubtitleQuery, options: Options = {}): Promise<SubtitleResult[]> {
    const key = String(options.subdlKey ?? '').trim()
    if (!key) return []

    const clock = startClock(8000, 'SubDL')
    const { movie, season, episode, numbers } = await episodeOf(query, clock)
    const params = new URLSearchParams({ api_key: key, languages: 'AR', subs_per_page: '30', type: movie ? 'movie' : 'tv' })
    if (query.imdbId) params.set('imdb_id', query.imdbId)
    else params.set('film_name', query.titles[0] ?? '')
    if (!movie) {
      params.set('season_number', String(season))
      params.set('episode_number', String(episode))
    }

    const res = await api(query.fetch, `${this.url}/api/v1/subtitles?${params}`, clock)
    const { subtitles = [] } = res ? await clock.run(res.json()) as { subtitles?: Item[] } : {}
    const items = subtitles
      .filter(item => item.url && (movie || !item.season || item.season === season))
      .sort((a, b) => Number(!!a.full_season) - Number(!!b.full_season))

    return await answer(items.slice(0, maxFiles(options) + 2).map(async item => {
      const download = await request(query.fetch, `https://dl.subdl.com${item.url}`, clock)
      const files = await unpack(new Uint8Array(await clock.run(download.arrayBuffer())), numbers, !item.full_season, clock)
      return files.map(file => ({ ...file, who: item.author || 'SubDL', release: item.release_name ?? '' }))
    }), query, options)
  }

  test () {
    return reachable(this.url)
  }
}()
