import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// public/ is what gets uploaded, so these look at it the way the internet would
const folder = new URL('../public/', import.meta.url)
const read = (name: string) => readFileSync(new URL(name, folder), 'utf8')
const built = (JSON.parse(read('index.json')) as Array<{ code: string }>).map(({ code }) => code.slice(code.lastIndexOf('/') + 1))

test('only what hayase needs is public, nothing from the source side can slip in', () => {
  assert.deepEqual(readdirSync(folder).sort(), ['404.html', '_headers', 'index.json', 'robots.txt', ...built].sort())
})

test('the manifest that goes out is the one in the repo', () => {
  assert.equal(read('index.json'), readFileSync(new URL('../index.json', import.meta.url), 'utf8'))
})

test('every file is sent locked down, with the cors hayase needs to fetch it', () => {
  const lines = read('_headers').split('\n')
  assert.ok(lines.includes('/*'))
  for (const header of [
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: no-referrer',
    'X-Robots-Tag: noindex, nofollow',
    "Content-Security-Policy: default-src 'none'; frame-ancestors 'none'",
    'Access-Control-Allow-Origin: *'
  ]) assert.ok(lines.includes(`  ${header}`), header)
})

test('a path that is not there is a real 404, without a 404.html pages hands out the home page instead', () => {
  assert.match(read('404.html'), /not found/)
})

test('search engines are told to stay away', () => {
  assert.match(read('robots.txt'), /^Disallow: \/$/m)
})
