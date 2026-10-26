import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// hayase imports each file from a blob, in a worker or in a hidden webview on ios 16 and up.
// these look at the built files the way those places would
const built: Record<string, string> = {
  'https://miraianime.net': 'mirai.js',
  'https://api.subdl.com': 'subdl.js',
  'https://api.subsource.net': 'subsource.js'
}
const read = (file: string) => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8')

test('no regex lookbehind, safari only has it from 16.4 and a module that has one does not load', () => {
  for (const file of Object.values(built)) assert.doesNotMatch(read(file), /\(\?<[=!]/, file)
})

test('nothing that only exists in a page or in node', () => {
  for (const file of Object.values(built)) assert.doesNotMatch(read(file), /\b(?:document|window|localStorage|importScripts|Buffer|require|process)\b/, file)
})

test('each is one file: no imports of anything else', () => {
  for (const file of Object.values(built)) {
    assert.doesNotMatch(read(file), /^import\s/m, file)
    assert.doesNotMatch(read(file), /\bimport\(/, file)
  }
})

test('loaded the way hayase loads them, each hands over single, test and url', async () => {
  for (const [url, file] of Object.entries(built)) {
    // a data url module has no neighbours to import from, same as a blob
    const mod = await import(`data:text/javascript;base64,${Buffer.from(read(file)).toString('base64')}`) as { default: Record<string, unknown> }
    assert.equal(typeof mod.default.single, 'function', file)
    assert.equal(typeof mod.default.test, 'function', file)
    assert.equal(mod.default.url, url, file)
  }
})
