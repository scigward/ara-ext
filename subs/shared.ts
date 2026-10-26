import { readPicked } from '../src/files.ts'
import { fontSource, withFont } from '../src/fonts.ts'
import { gather } from '../src/gather.ts'
import { asError } from '../src/http.ts'
import { unique } from '../src/label.ts'
import { pickFiles } from '../src/names.ts'
import { maxFiles } from '../src/plan.ts'
import { decodeText, detectFormat, toLink } from '../src/subtitle.ts'
import { zipFromBytes } from '../src/zip.ts'

import type { Clock } from '../src/clock.ts'
import type { Format } from '../src/subtitle.ts'
import type { Options, SubtitleQuery, SubtitleResult } from '../src/types.ts'

interface Found {
  who: string
  release: string
  text: string
  format: Format
}

interface Episode {
  movie: boolean
  season: number
  episode: number
  numbers: [number, number | undefined]
}

const fonts = fontSource()

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

export async function reachable (url: string) {
  try {
    await fetch(url)
  } catch {
    throw new Error(`Could not reach ${url}! Does the site work in your region?`)
  }
  return true
}

export async function get (url: string, query: SubtitleQuery, clock: Clock, site: string, headers?: Record<string, string>) {
  const res = await clock.run(query.fetch(url, headers && { headers }))
  if (res.status === 401 || res.status === 403) throw new Error(`${site} did not accept the API key, check it in the extension settings`)
  // both say "nothing found" this way
  if (res.status === 400 || res.status === 404) return undefined
  if (!res.ok) throw new Error(`${site} answered ${res.status}`)
  return res
}

export async function unpack (bytes: Uint8Array, numbers: Episode['numbers'], lone: boolean, clock: Clock): Promise<Array<{ text: string, format: Format }>> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    const text = decodeText(bytes)
    const format = detectFormat(text)
    return format ? [{ text, format }] : []
  }
  const zip = await zipFromBytes(bytes)
  const reads = await Promise.all(pickFiles(zip.entries.map(entry => entry.name), numbers, lone).map(file => readPicked(zip, file, clock)))
  return reads.flat()
}

export async function answer (downloads: Array<Promise<Found[]>>, query: SubtitleQuery, options: Options): Promise<SubtitleResult[]> {
  const font = downloads.length && options.fonts !== false ? fonts(query.fetch) : undefined
  const { values, errors } = await gather(downloads, 1500)
  if (!values.length && errors.length) throw asError(errors[0])

  const seen = new Set<string>()
  const picked: Found[] = []
  for (const found of values) {
    if (seen.has(found.text)) continue
    seen.add(found.text)
    picked.push(found)
  }

  const loaded = await font
  const shown = picked.slice(0, maxFiles(options)).map(found => ({ ...found, ...(loaded && withFont(found.text, found.format, loaded)) }))
  // hayase uses this as the file name, the type after the last dot decides how it's read
  const names = unique(shown.map(({ who, release, format }) => `${`Arabic - ${who}${release ? ` (${release.slice(0, 60)})` : ''}`.replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim()}.${format}`))
  return shown.map(({ text, format }, i) => ({ url: toLink(text, format), language: names[i]! }))
}
