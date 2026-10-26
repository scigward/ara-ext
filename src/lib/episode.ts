import { getJson } from './http.ts'

import type { Clock } from './clock.ts'
import type { SubtitleQuery } from './types.ts'

interface Episode {
  movie: boolean
  season: number
  episode: number
  // in the season, then through the series
  numbers: [number, number | undefined]
  imdb?: string
  // ani.zip knows where the tv databases put this episode
  mapped: boolean
}

interface AniZip {
  episodes?: Record<string, { seasonNumber?: number, episodeNumber?: number }>
  mappings?: { imdb_id?: string | null }
}

// subtitle sites number episodes like the tv databases, which often isn't how anilist splits seasons
export async function episodeOf (query: SubtitleQuery, clock: Clock): Promise<Episode> {
  const absolute = query.absoluteEpisodeNumber ?? undefined
  const anilist: Episode = {
    movie: query.media?.format === 'MOVIE',
    season: 1,
    episode: query.episode,
    numbers: [query.episode, absolute],
    // ani.zip can know more than one id (re:zero has its director's cut too), hayase joins them with |
    imdb: query.imdbId?.split('|')[0] || undefined,
    mapped: false
  }
  if (anilist.movie) return anilist
  try {
    const { episodes, mappings } = await getJson(query.fetch, `https://api.ani.zip/mappings?anilist_id=${query.anilistId}`, clock) as AniZip
    const { seasonNumber, episodeNumber } = episodes?.[query.episode] ?? {}
    if (seasonNumber && episodeNumber) return { ...anilist, season: seasonNumber, episode: episodeNumber, numbers: [episodeNumber, absolute], mapped: true }
    // ani.zip has nothing for it, so hayase lent it the ids of a related entry (attack on titan's second final special
    // gets the first one's). they point at the whole show and its absolute number is the other one's, only the titles are its own
    if (!mappings?.imdb_id && anilist.imdb) return { ...anilist, numbers: [query.episode, undefined], imdb: undefined }
  } catch {}
  return anilist
}
