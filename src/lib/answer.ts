import { fontSource, withFont } from './fonts.ts'
import { gather } from './gather.ts'
import { asError } from './http.ts'
import { toLink } from './subtitle.ts'

import type { Format } from './subtitle.ts'
import type { Options, SubtitleQuery, SubtitleResult } from './types.ts'

interface Found {
  who: string
  release: string
  text: string
  format: Format
}

const fonts = fontSource()

export function maxFiles (options: Options): number {
  return Math.min(8, Math.max(1, Math.round(Number(options.maxFiles) || 3)))
}

export function unique (names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(name => {
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    const dot = name.lastIndexOf('.')
    return n === 1 ? name : `${name.slice(0, dot)} ${n}${name.slice(dot)}`
  })
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
