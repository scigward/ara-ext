// what a returned subtitle looks like from the outside: is it one, is it arabic, does it fit the episode
import { batchOf, describe } from '../../src/lib/names.ts'
import { detectFormat } from '../../src/lib/subtitle.ts'

export interface Episode {
  // every number this episode goes by: anilist's, the tv databases' in its season, through the series
  numbers: number[]
  // minutes, anilist's average for the show
  duration?: number
  movie: boolean
  fonts: boolean
}

export interface Checked {
  lines: number
  // share of the dialogue's letters that are arabic
  arabic: number
  // seconds, when the last line ends
  end: number
  warnings: string[]
}

const CUE = /((?:\d+:)?\d\d:\d\d[.,]\d+)\s*-->\s*((?:\d+:)?\d\d:\d\d[.,]\d+)/

// 0:01:02.50, 00:01:02,500, 01:02.500
const toSeconds = (time: string) => time.replace(',', '.').split(':').reduce((total, part) => total * 60 + Number(part), 0) || 0

// the spoken lines and when the last one ends
function cues (text: string): { lines: string[], end: number } {
  const lines: string[] = []
  let end = 0
  if (/^\s*\[Script Info\]/im.test(text) || /^Dialogue:/m.test(text)) {
    for (const row of text.split(/\r?\n/)) {
      if (!row.startsWith('Dialogue:')) continue
      const fields = row.slice(9).split(',')
      end = Math.max(end, toSeconds(fields[2]?.trim() ?? ''))
      lines.push(fields.slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\[Nnh]/g, ' '))
    }
    return { lines, end }
  }
  const rows = text.split(/\r?\n/)
  for (let i = 0; i < rows.length; i++) {
    const m = CUE.exec(rows[i]!)
    if (!m) continue
    end = Math.max(end, toSeconds(m[2]!))
    let said = ''
    while (rows[i + 1]?.trim()) said += ` ${rows[++i]}`
    lines.push(said.replace(/<[^>]*>/g, ''))
  }
  return { lines, end }
}

// the name hayase shows, "Arabic - who (release).ass": the release can pin an episode, in the name or in a season tag
function namedEpisodes (language: string): Array<[number, number]> {
  const open = language.indexOf(' (')
  const close = language.lastIndexOf(')')
  if (open < 0 || close < open) return []
  const release = language.slice(open + 2, close)
  if (batchOf(release)) return []
  const described = describe(`${release}.srt`)
  return [described?.episodes, described?.season].filter((range): range is [number, number] => !!range)
}

export function checkFile (language: string, text: string, at: Episode): Checked {
  const warnings: string[] = []
  if (!detectFormat(text)) warnings.push('not a subtitle')
  const { lines, end } = cues(text)
  const letters = lines.join(' ').match(/\p{L}/gu) ?? []
  const arabic = letters.length ? letters.filter(c => /\p{Script=Arabic}/u.test(c)).length / letters.length : 0
  const long = !at.duration || at.duration >= 10

  if (long && lines.length < 30) warnings.push(`only ${lines.length} lines`)
  if (arabic < 0.5) warnings.push(`only ${Math.round(arabic * 100)}% arabic`)
  if (at.duration) {
    const minutes = end / 60
    // anilist keeps one average, double length first episodes are common
    if (minutes > at.duration * 2.2 + 2) warnings.push(`runs to ${Math.round(minutes)} min, the episode is about ${at.duration}`)
    if (long && minutes < at.duration * 0.4) warnings.push(`ends at ${Math.round(minutes)} min, the episode is about ${at.duration}`)
  }
  // a file that brings its own fonts is left as it is on purpose
  if (at.fonts && !/^\[Fonts\]/m.test(text)) warnings.push('no font inside')
  const named = at.movie ? [] : namedEpisodes(language)
  if (named.length && !named.some(range => at.numbers.some(n => n >= range[0] && n <= range[1]))) {
    warnings.push(`name says episode ${named[0]![0] === named[0]![1] ? named[0]![0] : named[0]!.join('-')}`)
  }
  return { lines: lines.length, arabic, end, warnings }
}
