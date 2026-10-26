import assert from 'node:assert/strict'
import { test } from 'node:test'

import { liveProblems } from '../scripts/live.ts'

const ORIGIN = 'https://example.pages.dev'
const files = { 'index.json': '[{"version":"1.2.3"}]', 'mirai.js': '// one built file', 'subdl.js': '// another' }

interface Reply { status?: number, body?: string, headers?: Record<string, string> }

const locked = { 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' }
const good = (): Record<string, Reply> => Object.fromEntries(Object.entries(files).map(([name, body]) => [`/${name}`, { body, headers: { ...locked } }]))

// anything not listed is a 404, like the real site with its 404.html
const siteWith = (replies: Record<string, Reply>): typeof fetch => async input => {
  const reply = replies[new URL(String(input)).pathname]
  return new Response(reply?.body ?? 'not found', { status: reply?.status ?? (reply ? 200 : 404), headers: reply?.headers })
}

const check = (replies: Record<string, Reply>) => liveProblems(ORIGIN, files, siteWith(replies))

test('a site that is right has nothing to complain about', async () => {
  assert.deepEqual(await check(good()), [])
})

test('an old deploy that has not reached the edge yet shows as a different file', async () => {
  const site = good()
  site['/index.json']!.body = '[{"version":"1.2.2"}]'
  assert.deepEqual(await check(site), ['index.json is not the file that was built'])
})

test('two stars joined by a comma are not cors, and nosniff has to be there', async () => {
  const site = good()
  site['/subdl.js']!.headers = { 'access-control-allow-origin': '*, *' }
  assert.deepEqual(await check(site), ['subdl.js has no clean cors header', 'subdl.js is missing nosniff'])
})

test('a file that did not go up is caught', async () => {
  const site = good()
  delete site['/subdl.js']
  assert.deepEqual(await check(site), ['subdl.js has no clean cors header', 'subdl.js is missing nosniff', 'subdl.js answered 404'])
})

test('a site that answers 200 for paths it should not have is caught, once per path', async () => {
  const site = { ...good(), '/mirai.js.map': { body: 'map' }, '/package.json': { body: '{}' } }
  assert.deepEqual(await check(site), [
    '/mirai.js.map answered 200, it must be 404',
    '/package.json answered 200, it must be 404'
  ])
})
