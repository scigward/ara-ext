import { answer, maxFiles } from '../lib/answer.ts'
import { cache } from '../lib/cache.ts'
import { DAY, startClock } from '../lib/clock.ts'
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

// a pack serves every episode of its season, so the next episode needs no download.
// packs with fonts inside run to 30 MB, too much to hold on a phone
const downloads = cache<Uint8Array>(DAY, 16)
const KEEP = 2 * 1024 * 1024

export default new class SubDL {
  url = 'https://api.subdl.com'

  async single (query: SubtitleQuery, options: Options = {}): Promise<SubtitleResult[]> {
    const key = String(options.subdlKey ?? '').trim()
    if (!key) return []

    const clock = startClock(8000, 'SubDL')
    const { movie, season, episode, numbers, imdb } = await episodeOf(query, clock)
    const params = new URLSearchParams({ api_key: key, languages: 'AR', subs_per_page: '30', type: movie ? 'movie' : 'tv' })
    if (imdb) params.set('imdb_id', imdb)
    else params.set('film_name', query.titles[0] ?? '')
    if (!movie) {
      params.set('season_number', String(season))
      params.set('episode_number', String(episode))
    }

    const res = await api(query.fetch, `${this.url}/api/v1/subtitles?${params}`, clock)
    const { subtitles = [] } = res ? await clock.run(res.json()) as { subtitles?: Item[] } : {}
    const items = subtitles
      .filter(item => item.url && (movie || !item.season || item.season === season))
      // packs first, the site's order otherwise
      .sort((a, b) => Number(!!b.full_season) - Number(!!a.full_season))

    return await answer(items.slice(0, maxFiles(options) + 2).map(async item => {
      const url = `https://dl.subdl.com${item.url}`
      let bytes = downloads.get(url)
      if (!bytes) {
        bytes = new Uint8Array(await clock.run((await request(query.fetch, url, clock)).arrayBuffer()))
        if (bytes.length <= KEEP) downloads.set(url, bytes)
      }
      const files = await unpack(bytes, numbers, !item.full_season, clock)
      return files.map(file => ({ ...file, who: item.author || 'SubDL', release: item.release_name ?? '' }))
    }), query, options)
  }

  test () {
    return reachable(this.url)
  }
}()
