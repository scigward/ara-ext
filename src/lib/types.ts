// just the bits of hayase's extension api we use

export interface SubtitleQuery {
  anilistId: number
  malId?: number | null
  anidbAid?: number | null
  imdbId?: string | null
  episode: number
  episodeCount?: number
  absoluteEpisodeNumber?: number | null
  titles: string[]
  media?: { idMal?: number | null, format?: string | null, startDate?: { year?: number | null } | null, seasonYear?: number | null }
  // on ios this is a proxy: no response headers, no body stream
  fetch: typeof fetch
}

export type Options = Record<string, string | number | boolean | null | undefined>

export interface SubtitleResult {
  url: string
  language: string
}
