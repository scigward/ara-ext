import assert from 'node:assert/strict'
import { test } from 'node:test'

import { startClock } from '../src/clock.ts'
import { openZip } from '../src/zip.ts'

import { fakeSite, iosLike } from './helpers/server.ts'
import { buildZip } from './helpers/zipbuilder.ts'

const URL_ = 'https://miraianime.net/wp-content/uploads/test.zip'
const clock = () => startClock(5000)
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

// incompressible filler so the zip really gets big
function noise (length: number, seed: number) {
  const out = new Uint8Array(length)
  let s = seed
  for (let i = 0; i < length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    out[i] = s >>> 24
  }
  return out
}

const bigZip = (extra: Parameters<typeof buildZip>[0] = []) => buildZip([
  ...extra,
  ...Array.from({ length: 200 }, (_, i) => ({ name: `file-${i}.bin`, data: noise(2048, i + 1), method: 0 as const }))
])

test('a small zip is listed and read from one request', async () => {
  const zip = buildZip([{ name: 'a.ass', data: '[Script Info]\nDialogue: x' }, { name: 'Mirai Anime.txt', data: 'credits' }])
  const site = fakeSite({ [URL_]: zip })
  const opened = await openZip(iosLike(site.fetch), URL_, clock())

  assert.deepEqual(opened.entries.map(e => e.name), ['a.ass', 'Mirai Anime.txt'])
  assert.equal(text(await opened.read(opened.entries[0]!, clock())), '[Script Info]\nDialogue: x')
  assert.equal(site.hits.length, 1)
})

test('an entry far from the end is fetched with a small range', async () => {
  const zip = bigZip([{ name: 'first.ass', data: 'Dialogue: first' }])
  const site = fakeSite({ [URL_]: zip })
  const opened = await openZip(iosLike(site.fetch), URL_, clock())
  assert.equal(opened.entries.length, 201)

  assert.equal(text(await opened.read(opened.entries[0]!, clock())), 'Dialogue: first')
  assert.equal(site.hits.length, 2)
  assert.match(site.hits[1]!.range!, /^bytes=0-\d{3,4}$/)
})

test('a server that ignores ranges still works, from the one download', async () => {
  const zip = bigZip([{ name: 'first.ass', data: 'Dialogue: first' }])
  const site = fakeSite({ [URL_]: zip }, { ranges: false })
  const opened = await openZip(iosLike(site.fetch), URL_, clock())

  assert.equal(text(await opened.read(opened.entries[0]!, clock())), 'Dialogue: first')
  assert.equal(site.hits.length, 1)
})

test('a long local extra field costs one more request, not a failure', async () => {
  const zip = bigZip([{ name: 'first.ass', data: 'Dialogue: first', localExtra: 2000 }])
  const site = fakeSite({ [URL_]: zip })
  const opened = await openZip(iosLike(site.fetch), URL_, clock())

  assert.equal(text(await opened.read(opened.entries[0]!, clock())), 'Dialogue: first')
  assert.equal(site.hits.length, 3)
})

test('stored entries are read as they are', async () => {
  const site = fakeSite({ [URL_]: buildZip([{ name: 's.srt', data: 'plain', method: 0 }]) })
  const opened = await openZip(site.fetch, URL_, clock())
  assert.equal(text(await opened.read(opened.entries[0]!, clock())), 'plain')
})

test('names in cp1256 and with backslashes come out right', async () => {
  const site = fakeSite({
    [URL_]: buildZip([
      { name: Uint8Array.from([0xc7, 0xe1, 0x2e, 0x61, 0x73, 0x73]), data: 'a' },
      { name: 'folder\\file.ass', data: 'b' },
      { name: 'مرحبا.ass', data: 'c', flags: 0x800 }
    ])
  })
  const opened = await openZip(site.fetch, URL_, clock())
  assert.deepEqual(opened.entries.map(e => e.name), ['ال.ass', 'folder/file.ass', 'مرحبا.ass'])
})

test('a zip with a long comment is still found', async () => {
  const site = fakeSite({ [URL_]: buildZip([{ name: 'a.ass', data: 'a' }], 'x'.repeat(3000)) })
  const opened = await openZip(site.fetch, URL_, clock())
  assert.equal(opened.entries.length, 1)
})

test('damaged, encrypted and odd entries are refused, not returned', async () => {
  const site = fakeSite({
    [URL_]: buildZip([
      { name: 'bad-crc.ass', data: 'abc', crc: 123 },
      { name: 'locked.ass', data: 'abc', flags: 1 },
      { name: 'odd.ass', data: 'abc', method: 99 as 0 }
    ])
  })
  const opened = await openZip(site.fetch, URL_, clock())
  const [bad, locked, odd] = opened.entries
  await assert.rejects(opened.read(bad!, clock()), /damaged/)
  await assert.rejects(opened.read(locked!, clock()), /encrypted/)
  await assert.rejects(opened.read(odd!, clock()), /can't open/)
})

test('something that is not a zip says so', async () => {
  const site = fakeSite({ [URL_]: '<html>nope</html>' })
  await assert.rejects(openZip(site.fetch, URL_, clock()), /not a zip/)
})

test('a missing file is an http error with the status in it', async () => {
  const site = fakeSite({})
  await assert.rejects(openZip(site.fetch, URL_, clock()), /404/)
})

test('a stuck server runs into the clock', async () => {
  const site = fakeSite({ [URL_]: buildZip([{ name: 'a.ass', data: 'a' }]) }, { delay: 300 })
  await assert.rejects(openZip(site.fetch, URL_, startClock(50)), /took too long/)
})
