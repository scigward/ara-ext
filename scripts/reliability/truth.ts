// what the sites themselves have, asked plainly: the yardstick a miss is measured against
import { noClock } from '../../src/lib/clock.ts'
import { episodeOf } from '../../src/lib/episode.ts'
import { batchOf, describe, squash } from '../../src/lib/names.ts'

import type { SubtitleQuery } from '../../src/lib/types.ts'

export interface Truth {
  // arabic releases the site lists for this show and season
  releases: number
  // the ones whose name says this episode, or a run of episodes with it in
  fitting: number
}

function fitter (numbers: Array<number | undefined>) {
  return (name: string) => {
    const batch = batchOf(name)
    const described = batch ? undefined : describe(`${name}.srt`)
    return [batch ?? described?.episodes, described?.season].some(range => !!range && numbers.some(n => n !== undefined && n >= range[0] && n <= range[1]))
  }
}

interface Show { movieId?: number, title?: string, type?: string, season?: number | null }

export async function subsourceTruth (query: SubtitleQuery, key: string): Promise<Truth> {
  const { movie, season, numbers, imdb } = await episodeOf(query, noClock)
  const { fetch: fetchFn } = query
  const get = async (path: string) => {
    const res = await fetchFn(`https://api.subsource.net/api/v1${path}`, { headers: { 'X-API-Key': key } })
    if (res.status === 404 || res.status === 400) return undefined
    if (!res.ok) throw new Error(`subsource answered ${res.status}`)
    return await res.json() as { data?: unknown[] }
  }
  const search = imdb ? `searchType=imdb&imdb=${encodeURIComponent(imdb)}` : `searchType=text&q=${encodeURIComponent(query.titles[0] ?? '')}`
  const titles = new Set(query.titles.map(squash))
  const ours = (shows: Show[]) => shows.filter(s => typeof s.movieId === 'number' &&
    (movie ? s.type === 'movie' : s.type !== 'movie' && [season, 0, null, undefined].includes(s.season)) &&
    (imdb || titles.has(squash(s.title ?? ''))))
  // the season the episode is in, else one that holds every episode
  let shows = ours((await get(`/movies/search?${search}&type=${movie ? 'movie' : 'series'}`))?.data as Show[] ?? [])
  if (!movie && !shows.some(s => s.season === season)) shows = [...ours((await get(`/movies/search?${search}&type=series&season=${season}`))?.data as Show[] ?? []), ...shows]
  const show = shows.find(s => s.season === season) ?? shows[0]
  if (!show) return { releases: 0, fitting: 0 }

  const listed = (await get(`/subtitles?movieId=${show.movieId}&language=arabic&limit=100&sort=popular`))?.data as Array<{ releaseInfo?: string[] | string }> ?? []
  const fits = fitter(numbers)
  return { releases: listed.length, fitting: movie ? listed.length : listed.filter(s => [s.releaseInfo ?? []].flat().some(fits)).length }
}

export async function subdlTruth (query: SubtitleQuery, key: string): Promise<Truth> {
  const { movie, season, numbers, imdb } = await episodeOf(query, noClock)
  const params = new URLSearchParams({ api_key: key, languages: 'AR', subs_per_page: '30', type: movie ? 'movie' : 'tv' })
  if (imdb) params.set('imdb_id', imdb)
  else params.set('film_name', query.titles[0] ?? '')
  const { fetch: fetchFn } = query
  const res = await fetchFn(`https://api.subdl.com/api/v1/subtitles?${params}`)
  if (res.status === 404 || res.status === 400) return { releases: 0, fitting: 0 }
  if (!res.ok) throw new Error(`subdl answered ${res.status}`)
  const { subtitles = [] } = await res.json() as { subtitles?: Array<{ release_name?: string, season?: number, full_season?: boolean }> }
  const here = subtitles.filter(s => movie || !s.season || s.season === season)
  const fits = fitter(numbers)
  return { releases: here.length, fitting: movie ? here.length : here.filter(s => s.full_season || fits(s.release_name ?? '')).length }
}
