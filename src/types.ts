// the slice of hayase's extension api we touch, see types.d.ts in its interface

export interface SubtitleQuery {
  anilistId: number
  malId?: number | null
  anidbAid?: number | null
  episode: number
  episodeCount?: number
  absoluteEpisodeNumber?: number | null
  titles: string[]
  media?: { idMal?: number | null, format?: string | null }
  // hayase passes its own fetch in, on ios it's a proxy (no headers on the response, no body stream)
  fetch: typeof fetch
}

export type Options = Record<string, string | number | boolean | null | undefined>

export interface SubtitleResult {
  url: string
  language: string
}
