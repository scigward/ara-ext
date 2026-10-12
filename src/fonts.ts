import { startClock } from './clock.ts'
import { request } from './http.ts'

import type { Format } from './subtitle.ts'

// a style that names a font nobody has comes out as empty boxes, and the web app has no arabic font of its own.
// libass only takes a font from the file itself (or from the host), so the font goes inside the file
export const FAMILY = 'Noto Naskh Arabic'

// google's truetype files. the woff2 pieces hayase's own google lookup fetches were refused by its renderer
// ("error opening memory font"), these open
const FILES = {
  regular: 'https://fonts.gstatic.com/s/notonaskharabic/v33/RrQ5bpV-9Dd1b1OAGA6M9PkyDuVBePeKNaxcsss0Y7bwvc5krK019_I.ttf',
  bold: 'https://fonts.gstatic.com/s/notonaskharabic/v33/RrQ5bpV-9Dd1b1OAGA6M9PkyDuVBePeKNaxcsss0Y7bwWslkrK019_I.ttf'
}

const DAY = 24 * 60 * 60 * 1000

export interface Fonts {
  regular: Uint8Array
  bold: Uint8Array
}

export type FontSource = (fetchFn: typeof fetch) => Promise<Fonts | undefined>

// both weights, kept for a day. when google can't be reached it says nothing and the next call tries again
export function fontSource (): FontSource {
  let loading: Promise<Fonts> | undefined
  let until = 0

  return async fetchFn => {
    if (!loading || Date.now() > until) {
      // its own clock, a slow google must not hold the subtitles back
      const clock = startClock(4000)
      const get = async (url: string) => new Uint8Array(await clock.run((await request(fetchFn, url, clock)).arrayBuffer()))
      const mine = Promise.all([get(FILES.regular), get(FILES.bold)]).then(([regular, bold]) => ({ regular, bold }))
      loading = mine
      until = Date.now() + DAY
      mine.catch(() => { if (loading === mine) loading = undefined })
    }
    try {
      return await loading
    } catch {
      return undefined
    }
  }
}

// ass wants a font as text: 3 bytes become 4 characters (value + 33), 80 characters to a line
export function uuencode (bytes: Uint8Array): string[] {
  let text = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const quad = String.fromCharCode(33 + ((n >> 18) & 63), 33 + ((n >> 12) & 63), 33 + ((n >> 6) & 63), 33 + (n & 63))
    // the last group is cut short, no padding
    text += quad.slice(0, Math.min(3, bytes.length - i) + 1)
  }
  const lines: string[] = []
  for (let i = 0; i < text.length; i += 80) lines.push(text.slice(i, i + 80))
  return lines
}

const embedded = (name: string, bytes: Uint8Array, index: number) => [`fontname: ${name}_${index}.ttf`, ...uuencode(bytes)]

// libass finds the font by the name inside it, so the styles have to ask for exactly that name
function restyle (text: string, fonts: Fonts): string | undefined {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  let section = ''
  let columns = ['name', 'fontname', 'fontsize', 'primarycolour', 'secondarycolour', 'outlinecolour', 'backcolour', 'bold']
  let events = -1
  let bold = false
  let regular = false

  const out = lines.map((line, i) => {
    const header = /^\s*\[(.+?)\]\s*$/.exec(line)
    if (header) {
      section = header[1]!.toLowerCase()
      if (section === 'events' && events < 0) events = i
      return line
    }
    if (section.includes('styles')) {
      if (/^format:/i.test(line)) columns = line.slice(line.indexOf(':') + 1).split(',').map(c => c.trim().toLowerCase())
      if (!/^style:/i.test(line)) return line

      const cells = line.slice(line.indexOf(':') + 1).trimStart().split(',')
      const font = columns.indexOf('fontname')
      if (font < 0 || font >= cells.length) return line
      cells[font] = FAMILY
      // -1 or 1 is bold, 0 or no column at all is not
      const weight = Number(cells[columns.indexOf('bold')])
      if (weight && Number.isFinite(weight)) bold = true
      else regular = true
      return `Style: ${cells.join(',')}`
    }
    // a line can switch font on its own, the same box would come out
    return section === 'events' && /^dialogue:/i.test(line) ? line.replace(/\\fn[^\\}]+/g, `\\fn${FAMILY}`) : line
  })
  if (!bold && !regular) return undefined

  const files = [
    ...(regular ? embedded('NotoNaskhArabic-Regular', fonts.regular, 0) : []),
    ...(bold ? embedded('NotoNaskhArabic-Bold', fonts.bold, 1) : [])
  ]
  // before the events, so the end of the file stays what hayase expects to find there
  out.splice(events < 0 ? out.length : events, 0, '[Fonts]', ...files, '')
  return out.join(eol)
}

const HEADER = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'WrapStyle: 0',
  'PlayResX: 1920',
  'PlayResY: 1080',
  'ScaledBorderAndShadow: yes',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  // what hayase gives a plain srt, only the font is ours
  `Style: Default,${FAMILY},52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2.6,0,2,20,20,46,1`,
  ''
]

const CUE = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/

// ass counts in hundredths: h:mm:ss.cc
function stamp (h: string, m: string, s: string, ms: string): string {
  const total = ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 100 + Math.round(Number(ms.padEnd(3, '0')) / 10)
  const part = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(total / 360000)}:${part(Math.floor(total / 6000) % 60)}:${part(Math.floor(total / 100) % 60)}.${part(total % 100)}`
}

// a plain srt has nothing to name a font in, so it becomes an ass with the font in it
function fromSrt (text: string, fonts: Fonts): string | undefined {
  const events: string[] = []
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/)
    const at = lines.findIndex(line => CUE.test(line))
    const cue = at < 0 ? null : CUE.exec(lines[at]!)
    const words = lines.slice(at + 1).map(line => line.trim()).filter(Boolean)
    if (!cue || !words.length) continue

    const spoken = words.join('\\N')
      .replace(/<(\/?)([ibu])>/gi, (_, close: string, tag: string) => `{\\${tag.toLowerCase()}${close ? 0 : 1}}`)
      // font colours and the like, there is no good way to say them
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, '\\h').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    events.push(`Dialogue: 0,${stamp(cue[1]!, cue[2]!, cue[3]!, cue[4]!)},${stamp(cue[5]!, cue[6]!, cue[7]!, cue[8]!)},Default,,0,0,0,,${spoken}`)
  }
  if (!events.length) return undefined

  const head = [...HEADER, '[Fonts]', ...embedded('NotoNaskhArabic-Regular', fonts.regular, 0), '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
  return [...head, ...events, ''].join('\r\n')
}

// the same subtitle with an arabic font that is really there. a file that brings its own fonts is left alone
export function withFont (text: string, format: Format, fonts: Fonts): { text: string, format: Format } {
  if (format === 'srt') {
    const converted = fromSrt(text, fonts)
    return converted ? { text: converted, format: 'ass' } : { text, format }
  }
  if ((format === 'ass' || format === 'ssa') && !/^\s*\[fonts\]/im.test(text)) return { text: restyle(text, fonts) ?? text, format }
  return { text, format }
}
