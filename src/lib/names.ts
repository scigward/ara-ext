import { formatOf } from './subtitle.ts'

import type { Format } from './subtitle.ts'

type Range = [number, number]

export interface Described {
  path: string
  // what the file extension says. txt and zip only count with an episode in the name: a txt is read for what it is,
  // a zip is one episode in its own archive (a few batches are zips of zips)
  format: Format | 'txt' | 'zip'
  // from the name, nothing if it has no number we trust. later seasons often number through the whole series (23)
  episodes?: Range
  // false when the number is just the start of the name, a title like "009 re:cyborg" has one
  strong: boolean
  // the number inside the season when the name tags one: [s2-01], (p2 - 03)
  season?: Range
  group?: string
  // other bits in brackets (1080p, a streaming service, the release group), they tell files apart
  tags: string[]
  // the name without its brackets
  title: string
  version: number
}

// a batch folder says 001-201, that's no single file. real multi episode files are the double length ones
const MAX_SPAN = 4

const YEAR = /^(?:19|20)\d\d$/
const TAG = /^(?:v\d+|\d{3,4}[pi]|\d{3,4}x\d{3,4}|[\da-f]{8}|bd(?:rip)?|blu-?ray|web(?:[ -]?(?:dl|rip))?|tv(?:rip)?|dvd(?:rip)?|hdtv|raw|aac|ac3|flac|x26[45]|h\.?26[45]|hevc|avc|\d+-?bits?|dual[ -]?audio|multi|batch|complete|(?:ar|ara|arabic)(?:[ -]?subs?)?|subs?|ass|srt|vtt|ssa|(?:19|20)\d\d)$/i
const SEASON_TAG = /^(?:S|P|Part\s*|Season\s*|Cour\s*)\d{1,2}\s*[-–]?\s*(?:E|EP)?\s*(\d{1,3})(?:\s+(?:END|FINAL|FIN))?$/i
const EPISODE_TAG = /^(?:E(?:P)?\s*)?(\d{1,4})(?:v\d+)?$/i
const PART_TAG = /^Part\s*(\d{1,2})$/i
// [01_of_62]
const OF_TAG = /^(\d{1,4})[\s_]*of[\s_]*\d{1,4}$/i
const SPECIAL_TAG = /^(?:OVA|OAD|ONA|SP|Specials?)$/i

const asciiDigits = (text: string) => text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))

function span (a: string, b?: string): Range | undefined {
  const from = Number(a)
  const to = b === undefined ? from : Number(b)
  return to >= from && to - from < MAX_SPAN ? [from, to] : undefined
}

const OUTSIDE = [
  // s02e05, s02e05-e06
  /\bS\d{1,2}\s*E(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*E?(\d{1,4}))?(?![\d.])/i,
  // e05, ep05, episode 05, ep05-06
  /\bE(?:P|pisode)?\s*(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*E?(?:P|pisode)?\s*(\d{1,4}))?(?![\d.]|\s*p\b)/i,
  /(?:الحلقة|حلقة)\s*(\d{1,4})(?:\s*[-~&+]\s*(\d{1,4}))?/,
  /第\s*(\d{1,4})\s*話/
]

// "show - 05", "show - 05v2", "show - 001-002", the usual fansub way, the last one wins
const DASH = /(?:^|\s)-\s*(\d{1,4})(?:v\d+)?(?:\s*[-~&+]\s*(\d{1,4})(?:v\d+)?)?(?=\s|$)/g
// "classicaloid-07-arabic subtitle", no spaces around the dashes.
// (no lookbehind anywhere here, safari got it in 16.4 and one in a module stops it loading)
const HYPHEN = /(?:^|\D)-(\d{1,4})(?:v\d+)?(?=-|\s|$)/g
// "show 05", "show 01 and 02"
const TRAILING = /(?:^|\s)(\d{1,4})(?:v\d+)?(?:\s*(?:[-~&+,]|and)\s*(\d{1,4})(?:v\d+)?)?\s*$/i
// "sp1", "ova 2", "special 3"
const SPECIAL = /\b(?:SP|OVA|OAD|ONA|Special)s?\s*0*(\d{1,3})\b/i

interface Found {
  range?: Range
  strong: boolean
}

function episodesOf (outside: string, groups: string[]): Found {
  // dots separate words ("show.s02e05.1080p") except in "12.5", a half episode, no episode of ours
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

  const end = TRAILING.exec(text)
  // a lone 4 digit number like 2026 is a year more often than an episode
  if (end && !YEAR.test(end[1]!)) return { range: span(end[1]!, end[2]), strong: true }

  // a title that starts with a number ("07 ghost") proves nothing, "01.ass" is just a name
  const start = /^\s*(\d{1,4})(?:v\d+)?(?=[\s-]|$)/.exec(text)
  if (start && !YEAR.test(start[1]!)) return { range: span(start[1]!), strong: false }

  // nothing in the name itself, so brackets: [05], (part 2), [05_of_62] unless a bracket says it's a special
  const extra = groups.some(group => SPECIAL_TAG.test(group))
  for (const group of groups) {
    const m = EPISODE_TAG.exec(group) ?? PART_TAG.exec(group) ?? (extra ? null : OF_TAG.exec(group))
    if (m && !YEAR.test(m[1]!)) return { range: span(m[1]!), strong: true }
  }
  return { strong: false }
}

function seasonOf (groups: string[]): Range | undefined {
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

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

// markers say where a file sits, they don't name a group or tell files apart
const marker = (g: string) => EPISODE_TAG.test(g) || SEASON_TAG.test(g) || PART_TAG.test(g) || OF_TAG.test(g)

function groupOf (groups: string[]): string | undefined {
  return groups.map(clean).find(group => group && group.length <= 60 && !TAG.test(group) && !marker(group))
}

// junk inside zips: mac resource forks, dotfiles
const hidden = (path: string) => path.split('/').some(part => part === '__MACOSX' || part.startsWith('.'))

export function describe (path: string): Described | undefined {
  if (path.length > 400 || hidden(path)) return undefined
  const base = path.slice(path.lastIndexOf('/') + 1)
  const ext = base.slice(base.lastIndexOf('.') + 1).toLowerCase()
  const format = ext === 'txt' || ext === 'zip' ? ext : formatOf(base)
  if (!format) return undefined

  const groups: string[] = []
  const stem = asciiDigits(base.slice(0, base.lastIndexOf('.')))
  const outside = stem.replace(/[[(【]([^\])】]*)[\])】]/g, (_, inner: string) => {
    groups.push(inner.trim())
    return ' '
  })

  const { range: episodes, strong } = episodesOf(outside, groups)
  // some subbers save subtitles as txt. credits, fonts zips and the like have no episode, so they go
  if ((format === 'txt' || format === 'zip') && !episodes) return undefined

  const group = groupOf(groups)
  const noise = (g: string) => !g || g.length > 40 || clean(g) === group || /^v\d+$/i.test(g) || /^[\da-f]{8}$/i.test(g) || YEAR.test(g) || marker(g)
  return {
    path,
    format,
    episodes,
    strong,
    title: clean(outside.toLowerCase()),
    season: seasonOf(groups),
    group,
    tags: groups.filter(g => !noise(g)),
    version: versionOf(outside, groups)
  }
}

// letters and digits only, so "Re:Zero" meets "re zero"
export const squash = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// a release of an ova or a special, it's no tv episode
export const EXTRAS = /\b(?:OVA|OAD|Specials?)\b|[اأ]وفا/i

// a release that says it covers a run of episodes: "[1 ~ 13]", "(01-25)", "EP01A+B ~ 25End", "E01-E12"
const BATCH = /(?:^|[^\d.])(?:EP?\s*)?(\d{1,4})[a-z+]{0,3}\s*[-~]\s*(?:EP?\s*)?(\d{1,4})(?![\d.]|p\b)/gi

export function batchOf (release: string): Range | undefined {
  const text = asciiDigits(release)
  for (const m of text.matchAll(BATCH)) {
    // "S4 - 29" and "Season 2 - 13" are a season and its episode, not a run
    if (/(?:\bS|Season|Part|Cour)\s*$/i.test(text.slice(0, m.index + m[0].indexOf(m[1]!)))) continue
    const from = Number(m[1])
    const to = Number(m[2])
    if (to - from >= MAX_SPAN && !YEAR.test(m[1]!)) return [from, to]
  }
}

const RANK: Record<Format | 'txt' | 'zip', number> = { ass: 0, ssa: 1, srt: 2, vtt: 3, sub: 4, txt: 5, zip: 6 }

const within = (range: Range | undefined, n: number) => !!range && n >= range[0] && n <= range[1]
const shift = (range: Range | undefined, by: number): Range | undefined => range && [range[0] - by, range[1] - by]

// a zip whose names carry both numbers has one fixed gap (23 next to s2-01 is 22).
// when nearly all files agree on it, a typo in one tag shows and the gap still finds the file
function gapOf (all: Described[]): number | undefined {
  const gaps = all.filter(d => d.season && d.episodes).map(d => d.episodes![0] - d.season![0])
  if (gaps.length < 3) return undefined

  const counts = new Map<number, number>()
  for (const gap of gaps) counts.set(gap, (counts.get(gap) ?? 0) + 1)
  const [gap, count] = [...counts].sort((a, b) => b[1] - a[1])[0]!
  return count / gaps.length >= 0.75 ? gap : undefined
}

export interface Picked extends Described {
  // more than one group in the zip, so the file name says best who made it
  mixed: boolean
}

// the files of one zip for this episode, best copy of each (format, then version).
// lone: the zip is said to be for this one episode. span: the episodes it is said to cover
export function pickFiles (paths: string[], episodes: Array<number | undefined>, lone: boolean, span?: Range): Picked[] {
  const all = paths.map(describe).filter((d): d is Described => !!d)
  const mixed = new Set(all.map(d => d.group).filter(Boolean)).size > 1
  const [episode, absolute] = episodes

  // two numberings can share a name: the plain one and the season tag (or the gap from it). the source uses
  // one of them, the one that puts the files inside its span
  const gap = gapOf(all)
  const main = (d: Described) => d.episodes
  const season = (d: Described) => gap !== undefined && d.episodes ? shift(d.episodes, gap) : d.season
  const fit = (pick: (d: Described) => Range | undefined) => span
    ? all.filter(d => {
      const range = pick(d)
      return !!range && range[0] >= span[0] && range[1] <= span[1]
    }).length
    : 0

  let found: Described[] = []
  if (episode !== undefined) {
    for (const pick of fit(main) > fit(season) ? [main, season] : [season, main]) {
      found = all.filter(d => within(pick(d), episode))
      if (found.length) break
    }
  }
  if (!found.length && absolute !== undefined) found = all.filter(d => within(d.episodes, absolute))

  // the zip numbers its files its own way (39 to 50 for the twelve episodes of a part 2). if no file number
  // falls in the span and there are as many numbers as episodes, the nth file is the nth episode
  if (!found.length && span && episode !== undefined && episode >= span[0] && episode <= span[1]) {
    const numbers = [...new Set(all.flatMap(d => d.episodes ? [d.episodes[0]] : []))].sort((a, b) => a - b)
    const elsewhere = all.every(d => !d.episodes || d.episodes[1] < span[0] || d.episodes[0] > span[1])
    if (elsewhere && numbers.length === span[1] - span[0] + 1) found = all.filter(d => d.episodes?.[0] === numbers[episode - span[0]])
  }

  if (!found.length) {
    // the source says which episode this zip is for and it's the better judge: a lone file is it, whatever its
    // number says. files that agree on one number are variants of that episode, files that don't are other episodes
    const numbers = new Set(all.flatMap(d => d.episodes ? [d.episodes[0]] : []))
    if (lone) found = all.length === 1 || numbers.size <= 1 ? all : all.filter(d => !d.strong)
    // one file with no number is a special or a compilation, it covers whatever the source says
    else if (all.length === 1 && !all[0]!.episodes) found = all
  }

  // same group, episode and name twice is another format or a v2, keep one
  const best = new Map<string, Described>()
  for (const d of found) {
    const key = `${d.group ?? ''}|${d.episodes?.join('-') ?? ''}|${d.tags.join(' ')}|${d.title}`
    const had = best.get(key)
    if (!had || d.version > had.version || (d.version === had.version && RANK[d.format] < RANK[had.format])) best.set(key, d)
  }
  return [...best.values()].map(d => ({ ...d, mixed }))
}
