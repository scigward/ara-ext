import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

interface Entry {
  manifestVersion: number
  name: string
  version: string
  id: string
  type: string
  accuracy: string
  icon: string
  update: string
  code: string
  media: string
  languages: string[]
  url: string
  options: Record<string, { type: string, description: string, default: unknown }>
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const manifest = JSON.parse(read('../index.json')) as Entry[]

test('the manifest has what hayase insists on when importing', () => {
  assert.equal(manifest.length, 1)
  const [entry] = manifest
  for (const key of ['name', 'version', 'id', 'type', 'accuracy', 'icon', 'update', 'code']) assert.ok(key in entry!, key)
  assert.equal(entry!.type, 'subtitle')
  assert.equal(entry!.manifestVersion, 2)
})

test('update and code point at the pages site, the icon is the favicon of the site itself', () => {
  const [entry] = manifest
  assert.equal(entry!.update, 'https://mirai-ext.pages.dev/index.json')
  assert.equal(entry!.code, 'https://mirai-ext.pages.dev/mirai.js')
  // no artwork of our own in this repo
  assert.match(entry!.icon, /^https:\/\/miraianime\.net\/wp-content\/uploads\/[^/]+\.png$/)
})

test('the site is told to hayase as a base64 origin, so desktop hayase can switch cors on for it', () => {
  // the pages and the zips send no cors headers, only the ios app (which has no cors) works without this
  assert.equal(atob(manifest[0]!.url), 'https://miraianime.net')
})

test('the version lives in index.json only, so bumping it never needs anything else to follow', () => {
  // hayase updates the extension when this changes. package.json and the built file carry no version of their own
  assert.match(manifest[0]!.version, /^\d+\.\d+\.\d+$/)
  assert.equal('version' in (JSON.parse(read('../package.json')) as object), false)
  assert.doesNotMatch(read('../public/mirai.js').split('\n')[0]!, /\d+\.\d+\.\d+/)
})

test('the built file the manifest points at exists', () => {
  assert.ok(existsSync(new URL('../public/mirai.js', import.meta.url)))
})

test('options are typed like hayase expects', () => {
  for (const option of Object.values(manifest[0]!.options)) {
    assert.ok(['string', 'number', 'boolean', 'select'].includes(option.type))
    assert.ok(option.description.length > 0)
    assert.ok('default' in option)
  }
})
