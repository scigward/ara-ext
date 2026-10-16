import assert from 'node:assert/strict'
import { test } from 'node:test'

import { liveProblems } from '../scripts/live.ts'

const ORIGIN = 'https://example.pages.dev'
const expected = { version: '1.2.3', bundle: '// the built file' }

interface Reply { status?: number, body?: string, headers?: Record<string, string> }

const good = (): Record<string, Reply> => ({
  '/index.json': {
    body: JSON.stringify([{ version: '1.2.3', update: `${ORIGIN}/index.json`, code: `${ORIGIN}/mirai.js` }]),
    headers: { 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' }
  },
  '/mirai.js': { body: expected.bundle, headers: { 'access-control-allow-origin': '*' } }
})

// anything not listed is a 404, like the real site with its 404.html
const siteWith = (replies: Record<string, Reply>): typeof fetch => async input => {
  const reply = replies[new URL(String(input)).pathname]
  return new Response(reply?.body ?? 'not found', { status: reply?.status ?? (reply ? 200 : 404), headers: reply?.headers })
}

const check = (replies: Record<string, Reply>) => liveProblems(ORIGIN, expected, siteWith(replies))

test('a site that is right has nothing to complain about', async () => {
  assert.deepEqual(await check(good()), [])
})

test('an old deploy that has not reached the edge yet shows as a wrong version', async () => {
  const site = good()
  site['/index.json']!.body = JSON.stringify([{ version: '1.2.2', update: `${ORIGIN}/index.json`, code: `${ORIGIN}/mirai.js` }])
  assert.deepEqual(await check(site), ['index.json says 1.2.2, wanted 1.2.3'])
})

test('two stars joined by a comma are not cors', async () => {
  const site = good()
  site['/mirai.js']!.headers = { 'access-control-allow-origin': '*, *' }
  assert.deepEqual(await check(site), ['mirai.js has no clean cors header'])
})

test('a different built file is caught', async () => {
  const site = good()
  site['/mirai.js']!.body = '// something else'
  assert.deepEqual(await check(site), ['mirai.js is not the file that was built'])
})

test('a manifest that links somewhere else is caught', async () => {
  const site = good()
  site['/index.json']!.body = JSON.stringify([{ version: '1.2.3', update: 'https://elsewhere.dev/index.json', code: `${ORIGIN}/mirai.js` }])
  assert.deepEqual(await check(site), ['index.json points its update link somewhere else'])
})

test('a site that answers 200 for paths it should not have is caught, once per path', async () => {
  const site = { ...good(), '/mirai.js.map': { body: 'map' }, '/package.json': { body: '{}' } }
  assert.deepEqual(await check(site), [
    '/mirai.js.map answered 200, it must be 404',
    '/package.json answered 200, it must be 404'
  ])
})

test('a manifest that is not json is a problem and not a crash', async () => {
  const site = good()
  site['/index.json']!.body = '<html>home page</html>'
  const problems = await check(site)
  assert.ok(problems.some(problem => problem.startsWith('index.json says undefined')))
})
