import { formatOf } from './subtitle.ts'

import type { Format } from './subtitle.ts'

export interface Described {
  path: string
  // what the extension says, a txt only counts when its name has an episode and is read for what it is
  format: Format | 'txt'
  // from the file name, nothing when the name has no number we trust. a later season's batch often
  // numbers through the whole series here (23 for the first episode of season 2)
  episodes?: [number, number]
  // false when that number is only the start of the name, a title like "009 Re:Cyborg" has one too
  strong: boolean
  // the number inside the season, when the name tags one: [S2-01], (P2 - 03)
  season?: [number, number]
  group?: string
  // the name without its brackets, to tell apart files that are otherwise alike
  title: string
  // the leftover tags, 1080p and the like, they tell two files of one group apart
  tags: string[]
  version: number
}

// a batch folder says 001-201 and that must not read as one file spanning the lot,
// real multi episode files are the double length ones
const MAX_SPAN = 4

const YEAR = /^(?:19|20)\d\d$/
const TAG = /^(?:v\d+|\d{3,4}[pi]|\d{3,4}x\d{3,4}|[\da-f]{8}|bd(?:rip)?|blu-?ray|web(?:[ -]?(?:dl|rip))?|tv(?:rip)?|dvd(?:rip)?|hdtv|raw|aac|ac3|flac|x26[45]|h\.?26[45]|hevc|avc|\d+-?bits?|dual[ -]?audio|multi|batch|complete|(?:ar|ara|arabic)(?:[ -]?subs?)?|subs?|ass|srt|vtt|ssa|(?:19|20)\d\d)$/i
const SEASON_TAG = /^(?:S|P|Part\s*|Season\s*|Cour\s*)\d{1,2}\s*[-–]?\s*(?:E|EP)?\s*(\d{1,3})(?:\s+(?:END|FINAL|FIN))?$/i
const EPISODE_TAG = /^(?:E(?:P)?\s*)?(\d{1,4})(?:v\d+)?$/i
// the credits file every zip carries
const CREDITS = /^(?:www\.)?mirai/i

const asciiDigits = (text: string) => text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))

function span (a: string, b?: string): [number, number] | undefined {
  const from = Number(a)
  const to = b === undefined ? from : Number(b)
  return to >= from && to - from < MAX_SPAN ? [from, to] : undefined
}

const OUTSIDE = [
  // S02E05, S02E05-E06
  /\bS\d{1,2}\s*E(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*E?(\d{1,4}))?(?![\d.])/i,
  // E05, EP05, Episode 05, EP05-06
  /\bE(?:P|pisode)?\s*(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*E?(?:P|pisode)?\s*(\d{1,4}))?(?![\d.]|\s*p\b)/i,
  /(?:الحلقة|حلقة)\s*(\d{1,4})(?:\s*[-~&+]\s*(\d{1,4}))?/,
  /第\s*(\d{1,4})\s*話/
]

// "Show - 05", "Show - 05v2", "Show - 001-002", the usual fansub way, the last one wins
const DASH = /(?:^|\s)-\s*(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*(\d{1,4})(?:v\d+)?)?(?=\s|$)/g
// "ClassicaLoid-07-Arabic Subtitle", no spaces around the dashes
// (no lookbehind anywhere in this repo, safari only learned it in 16.4 and one in a module stops it from loading)
const HYPHEN = /(?:^|\D)-(\d{1,4})(?:v\d+)?(?=-|\s|$)/g
// "Show 05", "Show 01 and 02"
const TRAILING = /(?:^|\s)(\d{1,4})(?:v\d+)?(?:\s*(?:[-~&+,]|and)\s*(\d{1,4})(?:v\d+)?)?\s*$/i
// "SP1", "OVA 2", "Special 3"
const SPECIAL = /\b(?:SP|OVA|OAD|ONA|Special)s?\s*0*(\d{1,3})\b/i

interface Found {
  range?: [number, number]
  // false when it is only a bare number at the start of the name, which could just as well be the title
  strong: boolean
}

function episodesOf (outside: string, groups: string[]): Found {
  // dots are separators ("Show.S02E05.1080p"), except in "12.5", a half episode that is no episode of ours
  const text = outside.replaceAll('_', ' ').replace(/\./g, (dot, at: number, whole: string) =>
    /\d/.test(whole[at - 1] ?? '') && /^\d(?!\d)/.test(whole.slice(at + 1)) ? dot : ' ')

  for (const pattern of OUTSIDE) {
    const m = pattern.exec(text)
    if (m) return { range: span(m[1]!, m[2]), strong: true }
  }

  const dashed = [...text.matchAll(DASH)].at(-1)
  if (dashed) return { range: span(dashed[1]!, dashed[2]), strong: true }

  const hyphen = [...text.matchAll(HYPHEN)].filter(m => !YEAR.test(m[1]!)).at(-1)
  if (hyphen) return { range: span(hyphen[1]!), strong: true }

  const special = SPECIAL.exec(text)
  if (special) return { range: span(special[1]!), strong: true }

  // "Show 05", or "Show 01 and 02", the end of a name is where the number usually is
  const end = TRAILING.exec(text)
  // a lone 4 digit number like 2026 is a year more often than an episode
  if (end && !YEAR.test(end[1]!)) return { range: span(end[1]!, end[2]), strong: true }

  // a title that starts with a number ("07 Ghost", "009 Re:Cyborg") proves nothing, "01.ass" is a name of its own
  const start = /^\s*(\d{1,4})(?:v\d+)?(?=[\s-]|$)/.exec(text)
  if (start && !YEAR.test(start[1]!)) return { range: span(start[1]!), strong: false }

  for (const group of groups) {
    const m = EPISODE_TAG.exec(group)
    if (m && !YEAR.test(m[1]!)) return { range: span(m[1]!), strong: true }
  }
  return { strong: false }
}

function seasonOf (groups: string[]): [number, number] | undefined {
  for (const group of groups) {
    const m = SEASON_TAG.exec(group)
    if (m) return span(m[1]!)
  }
}

function versionOf (text: string, groups: string[]): number {
  const m = /\bv(\d)\b/i.exec(text) ?? /(?:^|\s|\d)v(\d)(?=\s|$)/i.exec(text)
  const tagged = groups.map(g => /^v(\d)$/i.exec(g)).find(Boolean)
  return Number(tagged?.[1] ?? m?.[1] ?? 1)
}

function groupOf (groups: string[]): string | undefined {
  for (const raw of groups) {
    const group = raw.replace(/\s+/g, ' ').trim()
    if (!group || group.length > 60 || TAG.test(group) || EPISODE_TAG.test(group) || SEASON_TAG.test(group)) continue
    return group
  }
}

// junk inside zips: mac resource forks, dotfiles
const hidden = (path: string) => path.split('/').some(part => part === '__MACOSX' || part.startsWith('.'))

export function describe (path: string): Described | undefined {
  if (path.length > 400 || hidden(path)) return undefined
  const base = path.slice(path.lastIndexOf('/') + 1)
  const format = base.toLowerCase().endsWith('.txt') ? 'txt' : formatOf(base)
  if (!format) return undefined

  const groups: string[] = []
  const stem = asciiDigits(base.slice(0, base.lastIndexOf('.')))
  const outside = stem.replace(/[[(【]([^\])】]*)[\])】]/g, (_, inner: string) => {
    groups.push(inner.trim())
    return ' '
  })

  const { range: episodes, strong } = episodesOf(outside, groups)
  // some subbers save the subtitle as a txt, the credits txt has no episode and goes
  if (format === 'txt' && (!episodes || CREDITS.test(base))) return undefined

  return {
    path,
    format,
    episodes,
    strong,
    title: outside.toLowerCase().replace(/\s+/g, ' ').trim(),
    season: seasonOf(groups),
    group: groupOf(groups),
    tags: groups.filter(g => TAG.test(g) && !/^v\d+$/i.test(g) && !/^[\da-f]{8}$/i.test(g) && !YEAR.test(g)),
    version: versionOf(outside, groups)
  }
}

const RANK: Record<Format | 'txt', number> = { ass: 0, ssa: 1, srt: 2, vtt: 3, sub: 4, txt: 5 }

const within = (range: [number, number] | undefined, n: number) => !!range && n >= range[0] && n <= range[1]

// a zip whose names carry both numbers has one fixed gap between them (23 next to S2-01 is 22).
// when nearly every file agrees on the gap a typo in one tag stands out, and the gap finds the file anyway
function gapOf (all: Described[]): number | undefined {
  const gaps = all.filter(d => d.season && d.episodes).map(d => d.episodes![0] - d.season![0])
  if (gaps.length < 3) return undefined

  const counts = new Map<number, number>()
  for (const gap of gaps) counts.set(gap, (counts.get(gap) ?? 0) + 1)
  const [gap, count] = [...counts].sort((a, b) => b[1] - a[1])[0]!
  return count / gaps.length >= 0.75 ? gap : undefined
}

export interface Picked extends Described {
  // the zip has more than one group in it, so the file name is the best word on who made it
  mixed: boolean
}

// the files of one zip that are for this episode, the best copy of each (format, then version).
// episodes is what hayase means first and then the series-wide number as a fallback.
// lone: the page says this zip is for this one episode, so it doesn't have to be proven by the names
export function pickFiles (paths: string[], episodes: Array<number | undefined>, lone: boolean): Picked[] {
  const all = paths.map(describe).filter((d): d is Described => !!d)
  const mixed = new Set(all.map(d => d.group).filter(Boolean)).size > 1
  const [episode, absolute] = episodes

  // inside a season tagged name the tag is the episode, the other number is the series-wide one
  const gap = gapOf(all)
  const inSeason = (d: Described): [number, number] | undefined =>
    gap !== undefined && d.episodes ? [d.episodes[0] - gap, d.episodes[1] - gap] : d.season ?? d.episodes
  let found = episode === undefined ? [] : all.filter(d => within(inSeason(d), episode))
  if (!found.length && absolute !== undefined) found = all.filter(d => within(d.episodes, absolute))

  if (!found.length) {
    // the page says which episode this zip is for, so only a name that clearly says another one can overrule it
    if (lone) found = all.filter(d => !d.strong)
    // a single file and no number is a special or a compilation, it covers whatever the page says
    else if (all.length === 1 && !all[0]!.episodes) found = all
  }

  // same group, episode and name twice means another format or a v2, keep one
  const best = new Map<string, Described>()
  for (const d of found) {
    const key = `${d.group ?? ''}|${d.episodes?.join('-') ?? ''}|${d.tags.join(' ')}|${d.title}`
    const had = best.get(key)
    if (!had || d.version > had.version || (d.version === had.version && RANK[d.format] < RANK[had.format])) best.set(key, d)
  }
  return [...best.values()].map(d => ({ ...d, mixed }))
}
