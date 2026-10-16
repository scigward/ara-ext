import assert from 'node:assert/strict'
import { test } from 'node:test'

import { startClock } from '../src/clock.ts'
import { asError, getJson, getText, HttpError, request } from '../src/http.ts'

import { fakeSite } from './helpers/server.ts'

const PAGE = 'https://miraianime.net/page/'
const clock = () => startClock(5000)

test('a good answer comes back, and the headers go along', async () => {
  const site = fakeSite({ [PAGE]: 'hello' })
  const res = await request(site.fetch, PAGE, clock(), { Range: 'bytes=-5' })
  assert.equal(await res.text(), 'hello')
  assert.equal(site.hits[0]!.range, 'bytes=-5')
})

test('anything else is an error that has the status and the path', async () => {
  const site = fakeSite({})
  await assert.rejects(request(site.fetch, PAGE, clock()), (error: unknown) =>
    error instanceof HttpError && error.status === 404 && error.message === 'mirai answered 404 for /page/')
})

test('the cloudflare check page says what to do', async () => {
  const site = fakeSite({ [PAGE]: { status: 403, body: '<title>Just a moment...</title>' } })
  await assert.rejects(getText(site.fetch, PAGE, clock()), /open the site once in a browser/)
})

test('a 403 that is not the check page is only a 403', async () => {
  const site = fakeSite({ [PAGE]: { status: 403, body: 'no' } })
  await assert.rejects(getText(site.fetch, PAGE, clock()), (error: unknown) => error instanceof HttpError && error.status === 403)
})

test('json comes back parsed', async () => {
  const site = fakeSite({ [PAGE]: '[{"id":1}]' })
  assert.deepEqual(await getJson(site.fetch, PAGE, clock()), [{ id: 1 }])
})

test('a page that is not json says so plainly, even when it is a 200', async () => {
  const site = fakeSite({ [PAGE]: '<html>log in</html>' })
  await assert.rejects(getJson(site.fetch, PAGE, clock()), /^Error: mirai answered something unexpected$/)
})

test('whatever was thrown can be shown', () => {
  const error = new Error('boom')
  assert.equal(asError(error), error)
  assert.equal(asError('boom').message, 'boom')
})
