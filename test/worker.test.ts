import assert from 'node:assert/strict'
import { test } from 'node:test'

import { serveUrl } from '../src/serve.ts'
import { handle } from '../worker/handler.ts'

import { UPLOADS } from './helpers/pages.ts'
import { fakeSite } from './helpers/server.ts'
import { buildZip } from './helpers/zipbuilder.ts'

import type { Item } from './helpers/zipbuilder.ts'

const SERVER = 'https://worker.test'
const ZIP = `${UPLOADS}/Cr-05.zip`
const ass = (line: string) => `[Script Info]\r\n\r\n[Events]\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,${line}\r\n`

function site (items: Item[] = [{ name: '[Cr] Show - 05.ass', data: ass('مرحبا') }]) {
  return fakeSite({ [ZIP]: buildZip(items) })
}

const ask = (fake: ReturnType<typeof site>, file: string, inner?: string, init?: RequestInit, zip = ZIP) =>
  handle(new Request(serveUrl(SERVER, zip, file, inner), init), fake.fetch)

test('a file of the zip comes out as plain utf-8, open to any page, kept for a day', async () => {
  const res = await ask(site(), '[Cr] Show - 05.ass')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), ass('مرحبا'))
  assert.match(res.headers.get('content-type')!, /^text\/plain; charset=utf-8/)
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
  assert.match(res.headers.get('cache-control')!, /max-age=86400/)
})

test('names with spaces, brackets and arabic survive the trip through the link', async () => {
  const name = '[كرانشي رول] Kusuriya (2026) - 01 [WEB].ass'
  const link = serveUrl(SERVER, ZIP, name)
  assert.ok(link.startsWith(`${SERVER}/sub?`))
  assert.equal(new URL(link).searchParams.get('file'), name)
  assert.equal(await (await ask(site([{ name, data: ass('x') }]), name)).text(), ass('x'))
})

test('a file in the zip inside the zip is found by the second path', async () => {
  const inner = buildZip([{ name: '[Cr] Boruto - 002.ass', data: ass('inner two') }])
  const fake = site([{ name: 'Boruto - 002.zip', data: inner, method: 0 }])
  assert.match(await (await ask(fake, 'Boruto - 002.zip', '[Cr] Boruto - 002.ass')).text(), /inner two/)
  assert.equal((await ask(fake, 'Boruto - 002.zip', 'nope.ass')).status, 404)
})

test('old windows-1256 files come out as utf-8', async () => {
  const bytes = new Uint8Array([...new TextEncoder().encode('Dialogue: '), 0xe3, 0xd1, 0xcd, 0xc8, 0xc7])
  const res = await ask(site([{ name: 'old.ass', data: bytes }]), 'old.ass')
  assert.equal(await res.text(), 'Dialogue: مرحبا')
})

test('only zips of the site are fetched, anything else is turned away before a request is made', async () => {
  const fake = site()
  for (const zip of [
    'https://example.com/wp-content/uploads/Cr-05.zip',
    'http://miraianime.net/wp-content/uploads/Cr-05.zip',
    'https://miraianime.net.evil.test/wp-content/uploads/Cr-05.zip',
    'https://miraianime.net@evil.test/wp-content/uploads/Cr-05.zip',
    'https://miraianime.net/wp-admin/Cr-05.zip',
    'https://miraianime.net/wp-content/uploads/Cr-05.rar',
    'https://miraianime.net/wp-content/uploads/Cr-05.zip?x=1',
    ''
  ]) assert.equal((await ask(fake, 'a.ass', undefined, undefined, zip)).status, 400, zip)
  assert.equal((await handle(new Request(`${SERVER}/sub?zip=${encodeURIComponent(ZIP)}`), fake.fetch)).status, 400)
  assert.equal(fake.hits.length, 0)
})

test('a file that is not in the zip, or a zip that is gone, is a 404', async () => {
  assert.equal((await ask(site(), 'missing.ass')).status, 404)
  assert.equal((await ask(site(), 'a.ass', undefined, undefined, `${UPLOADS}/Gone.zip`)).status, 404)
})

test('a file too big to be worth opening is a 422, a site that fails is a 502', async () => {
  const huge = site([{ name: 'big.ass', data: ass('x'), claimSize: 50 * 1024 * 1024 }])
  assert.equal((await ask(huge, 'big.ass')).status, 422)
  const broken = fakeSite({ [ZIP]: { status: 500 } })
  assert.equal((await ask(broken, 'a.ass')).status, 502)
})

test('head has no body, options answers the preflight, anything else is refused', async () => {
  const head = await ask(site(), '[Cr] Show - 05.ass', undefined, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')

  const options = await ask(site(), '[Cr] Show - 05.ass', undefined, { method: 'OPTIONS' })
  assert.equal(options.status, 204)
  assert.equal(options.headers.get('access-control-allow-origin'), '*')

  assert.equal((await ask(site(), '[Cr] Show - 05.ass', undefined, { method: 'POST', body: 'x' })).status, 405)
  assert.equal((await handle(new Request(`${SERVER}/other`), site().fetch)).status, 404)
})
