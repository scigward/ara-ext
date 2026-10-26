import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// hayase imports each file from a blob, in a worker or in a hidden webview on ios 16 and up.
// these look at the built files the way those places would
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const built = (JSON.parse(read('../index.json')) as Array<{ url: string, code: string }>).map(({ url, code }) => {
  const file = code.slice(code.lastIndexOf('/') + 1)
  return { file, site: atob(url), text: read(`../public/${file}`) }
})

test('no regex lookbehind, safari only has it from 16.4 and a module that has one does not load', () => {
  for (const { file, text } of built) assert.doesNotMatch(text, /\(\?<[=!]/, file)
})

test('nothing that only exists in a page or in node', () => {
  for (const { file, text } of built) assert.doesNotMatch(text, /\b(?:document|window|localStorage|importScripts|Buffer|require|process)\b/, file)
})

test('each is one file: no imports of anything else', () => {
  for (const { file, text } of built) {
    assert.doesNotMatch(text, /^import\s/m, file)
    assert.doesNotMatch(text, /\bimport\(/, file)
  }
})

test('loaded the way hayase loads them, each hands over single, test and the url its manifest names', async () => {
  for (const { file, site, text } of built) {
    // a data url module has no neighbours to import from, same as a blob
    const mod = await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`) as { default: Record<string, unknown> }
    assert.equal(typeof mod.default.single, 'function', file)
    assert.equal(typeof mod.default.test, 'function', file)
    assert.equal(mod.default.url, site, file)
  }
})
