import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fontSource, uuencode, withFont } from '../src/fonts.ts'

const fonts = { regular: Uint8Array.from([1, 2, 3, 4, 5]), bold: Uint8Array.from([9, 8, 7]) }

// the inverse of uuencode, to see that a font survives the trip
function decode (lines: string[]): Uint8Array {
  const text = lines.join('')
  const out: number[] = []
  for (let i = 0; i < text.length; i += 4) {
    const quad = [...text.slice(i, i + 4)].map(c => c.charCodeAt(0) - 33)
    const n = (quad[0]! << 18) | (quad[1]! << 12) | ((quad[2] ?? 0) << 6) | (quad[3] ?? 0)
    out.push(...[(n >> 16) & 255, (n >> 8) & 255, n & 255].slice(0, quad.length - 1))
  }
  return Uint8Array.from(out)
}

// the font that sits under a fontname line in the file, up to the next font or the blank line
function embeddedAs (file: string, name: string): Uint8Array {
  const lines = file.split(/\r?\n/)
  const start = lines.indexOf(`fontname: ${name}`) + 1
  assert.ok(start > 0, name)
  const end = lines.findIndex((line, i) => i >= start && (line === '' || line.startsWith('fontname:')))
  return decode(lines.slice(start, end))
}

function ass (font: string, bold: string, format = 'Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic') {
  return [
    '[Script Info]', 'Title: x', '', '[V4+ Styles]', `Format: ${format}`,
    `Style: Default,${font},26,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,${bold},0`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\fnAdobe Arabic\\b1}مرحبا', ''
  ].join('\r\n')
}

test('a font becomes ass text the way the files made by aegisub have it', () => {
  // 3 bytes to 4 characters, value plus 33, the last group cut short
  assert.deepEqual(uuencode(Uint8Array.from([0x43])), ['1Q'])
  assert.deepEqual(uuencode(Uint8Array.from([0x43, 0x61])), ['1W%'])
  assert.deepEqual(uuencode(Uint8Array.from([0x43, 0x61, 0x74])), ['1W&U'])
  assert.deepEqual(uuencode(Uint8Array.from([0, 1, 2, 3, 4])), ['!!%#!Q1'])
  assert.deepEqual(uuencode(Uint8Array.from([250, 251, 252, 253, 254, 255])), ['_PP]`@\\`'])
  assert.deepEqual(uuencode(new Uint8Array()), [])
})

test('lines are 80 characters and every length of font gets back to the same bytes', () => {
  let s = 7
  const bytes = Uint8Array.from({ length: 1000 }, () => { s = (s * 1664525 + 1013904223) >>> 0; return s >>> 24 })
  const lines = uuencode(bytes)
  assert.ok(lines.slice(0, -1).every(line => line.length === 80))
  assert.ok(lines.every(line => !/[\r\n]/.test(line)))
  for (let length = 0; length < 12; length++) assert.deepEqual(decode(uuencode(bytes.subarray(0, length))), bytes.subarray(0, length))
  assert.deepEqual(decode(lines), bytes)
})

test('every style asks for the embedded font, and a bold style embeds the bold file only', () => {
  const { text, format } = withFont(ass('Adobe Arabic', '-1'), 'ass', fonts)
  assert.equal(format, 'ass')
  assert.match(text, /Style: Default,Noto Naskh Arabic,26,/)
  assert.doesNotMatch(text, /Adobe Arabic/)
  // inline switches too, or those lines would come out as boxes
  assert.match(text, /\{\\fnNoto Naskh Arabic\\b1\}/)
  assert.ok(text.indexOf('[Fonts]') > 0 && text.indexOf('[Fonts]') < text.indexOf('[Events]'))
  assert.deepEqual(embeddedAs(text, 'NotoNaskhArabic-Bold_1.ttf'), fonts.bold)
  assert.doesNotMatch(text, /NotoNaskhArabic-Regular/)
  // windows line endings stay windows line endings
  assert.doesNotMatch(text, /[^\r]\n/)
})

test('a regular style embeds the regular file, a mix embeds both', () => {
  const regular = withFont(ass('Arial', '0'), 'ass', fonts).text
  assert.deepEqual(embeddedAs(regular, 'NotoNaskhArabic-Regular_0.ttf'), fonts.regular)
  assert.doesNotMatch(regular, /NotoNaskhArabic-Bold/)

  const mixed = ass('Arial', '0').replace('[Events]', 'Style: Sign,Impact,40,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0\r\n\r\n[Events]')
  const both = withFont(mixed, 'ass', fonts).text
  assert.deepEqual(embeddedAs(both, 'NotoNaskhArabic-Regular_0.ttf'), fonts.regular)
  assert.deepEqual(embeddedAs(both, 'NotoNaskhArabic-Bold_1.ttf'), fonts.bold)
  assert.match(both, /Style: Sign,Noto Naskh Arabic,40,/)
})

test('columns can come in any order, and a table with no bold column is regular', () => {
  const swapped = withFont(ass('Impact', '-1', 'Name, Bold, Fontname, Fontsize').replace('Default,Impact,26,&H00FFFFFF', 'Default,-1,Impact,26'), 'ass', fonts).text
  assert.match(swapped, /Style: Default,-1,Noto Naskh Arabic,26,/)
  assert.deepEqual(embeddedAs(swapped, 'NotoNaskhArabic-Bold_1.ttf'), fonts.bold)

  const none = withFont(ass('Impact', '0', 'Name, Fontname, Fontsize'), 'ass', fonts).text
  assert.deepEqual(embeddedAs(none, 'NotoNaskhArabic-Regular_0.ttf'), fonts.regular)
})

test('a file that brings its own fonts, or has no styles to speak of, is left alone', () => {
  const own = ass('Bahij', '0').replace('[Events]', '[Fonts]\r\nfontname: bahij_0.ttf\r\n!!!!\r\n\r\n[Events]')
  assert.equal(withFont(own, 'ass', fonts).text, own)

  const bare = '[Script Info]\r\n\r\n[Events]\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,hi\r\n'
  assert.equal(withFont(bare, 'ass', fonts).text, bare)
})

test('an srt becomes an ass in the look hayase gives it, with the font inside', () => {
  const srt = '1\r\n00:00:01,000 --> 00:00:02,500\r\n<i>مرحبا</i>\r\nسطر &amp; آخر\r\n\r\n2\r\n01:02:03,456 --> 01:02:04,000 X1:100\r\n<font color="#ff0000">أحمر</font>\r\n\r\n3\r\n00:00:59,999 --> 00:01:01,000\r\n{\\an8}فوق\r\n'
  const { text, format } = withFont(srt, 'srt', fonts)
  assert.equal(format, 'ass')
  assert.match(text, /Style: Default,Noto Naskh Arabic,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2\.6,0,2,20,20,46,1/)
  assert.deepEqual(embeddedAs(text, 'NotoNaskhArabic-Regular_0.ttf'), fonts.regular)

  const dialogue = text.split(/\r?\n/).filter(line => line.startsWith('Dialogue:'))
  assert.deepEqual(dialogue, [
    'Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\i1}مرحبا{\\i0}\\Nسطر & آخر',
    'Dialogue: 0,1:02:03.46,1:02:04.00,Default,,0,0,0,,أحمر',
    // 59.999 rounds up into the next minute
    'Dialogue: 0,0:01:00.00,0:01:01.00,Default,,0,0,0,,{\\an8}فوق'
  ])
})

test('an srt with nothing in it, and the formats nobody uses, are left alone', () => {
  assert.deepEqual(withFont('nothing here', 'srt', fonts), { text: 'nothing here', format: 'srt' })
  assert.deepEqual(withFont('WEBVTT\n', 'vtt', fonts), { text: 'WEBVTT\n', format: 'vtt' })
  assert.deepEqual(withFont('{1}{2}x', 'sub', fonts), { text: '{1}{2}x', format: 'sub' })
})

test('both fonts are fetched once and remembered, a failure is told to nobody and tried again', async () => {
  let calls = 0
  let ok = false
  const fetchFn = (async () => {
    calls++
    return ok ? new Response(Uint8Array.from([1, 2, 3])) : new Response('no', { status: 500 })
  }) as typeof fetch

  const source = fontSource()
  assert.equal(await source(fetchFn), undefined)
  assert.equal(calls, 2)

  ok = true
  const got = await source(fetchFn)
  assert.deepEqual(got?.bold, Uint8Array.from([1, 2, 3]))
  assert.equal(calls, 4)

  await source(fetchFn)
  await Promise.all([source(fetchFn), source(fetchFn)])
  assert.equal(calls, 4)
})
