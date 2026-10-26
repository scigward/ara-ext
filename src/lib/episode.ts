import type { Clock } from './clock.ts'
import type { SubtitleQuery } from './types.ts'

interface Episode {
  movie: boolean
  season: number
  episode: number
  // in the season, then through the series
  numbers: [number, number | undefined]
}

// subtitle sites number episodes like the tv databases, which often isn't how anilist splits seasons
export async function episodeOf (query: SubtitleQuery, clock: Clock): Promise<Episode> {
  const absolute = query.absoluteEpisodeNumber ?? undefined
  const anilist: Episode = { movie: query.media?.format === 'MOVIE', season: 1, episode: query.episode, numbers: [query.episode, absolute] }
  if (anilist.movie) return anilist
  try {
    const res = await clock.run(query.fetch(`https://api.ani.zip/mappings?anilist_id=${query.anilistId}`))
    const { episodes } = await clock.run(res.json()) as { episodes?: Record<string, { seasonNumber?: number, episodeNumber?: number }> }
    const { seasonNumber, episodeNumber } = episodes?.[query.episode] ?? {}
    if (seasonNumber && episodeNumber) return { movie: false, season: seasonNumber, episode: episodeNumber, numbers: [episodeNumber, absolute] }
  } catch {}
  return anilist
}
