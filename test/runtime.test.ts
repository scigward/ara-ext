import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// hayase imports the file from a blob, in a worker or in a hidden webview on ios 16 and up.
// these look at the built file the way those places would
const built = readFileSync(new URL('../public/mirai.js', import.meta.url), 'utf8')

test('no regex lookbehind, safari only has it from 16.4 and a module that has one does not load', () => {
  assert.doesNotMatch(built, /\(\?<[=!]/)
})

test('nothing that only exists in a page or in node', () => {
  assert.doesNotMatch(built, /\b(?:document|window|localStorage|importScripts|Buffer|require|process)\b/)
})

test('it is one file: no imports of anything else', () => {
  assert.doesNotMatch(built, /^import\s/m)
  assert.doesNotMatch(built, /\bimport\(/)
})

test('loaded the way hayase loads it, it hands over single, test and url', async () => {
  // a data url module has no neighbours to import from, same as a blob
  const mod = await import(`data:text/javascript;base64,${Buffer.from(built).toString('base64')}`) as { default: Record<string, unknown> }
  assert.equal(typeof mod.default.single, 'function')
  assert.equal(typeof mod.default.test, 'function')
  assert.equal(mod.default.url, 'https://miraianime.net')
})
