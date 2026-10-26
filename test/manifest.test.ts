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

// the file each one is built into, its icon (the site's own, no artwork of ours) and the site hayase opens cors for
const expected: Record<string, { file: string, icon: RegExp, site: string }> = {
  miraianime: { file: 'mirai.js', icon: /^https:\/\/miraianime\.net\/wp-content\/uploads\/[^/]+\.png$/, site: 'https://miraianime.net' },
  subdl: { file: 'subdl.js', icon: /^https:\/\/subdl\.com\/logo\/fav\.png$/, site: 'https://api.subdl.com' },
  subsource: { file: 'subsource.js', icon: /^https:\/\/subsource\.net\/icon\.png$/, site: 'https://api.subsource.net' }
}

test('three separate extensions with what hayase insists on when importing, and no description', () => {
  assert.deepEqual(manifest.map(entry => entry.id), Object.keys(expected))
  for (const entry of manifest) {
    for (const key of ['name', 'version', 'id', 'type', 'accuracy', 'icon', 'update', 'code']) assert.ok(key in entry, key)
    assert.equal(entry.type, 'subtitle')
    assert.equal(entry.manifestVersion, 2)
    assert.equal('description' in entry, false)
  }
})

test('update and code point at the pages site, the icon is the favicon of the site itself', () => {
  for (const entry of manifest) {
    assert.equal(entry.update, 'https://mirai-ext.pages.dev/index.json')
    assert.equal(entry.code, `https://mirai-ext.pages.dev/${expected[entry.id]!.file}`)
    assert.match(entry.icon, expected[entry.id]!.icon)
  }
})

test('each site is told to hayase as a base64 origin, so desktop and android hayase can switch cors on for it', () => {
  for (const entry of manifest) assert.equal(atob(entry.url), expected[entry.id]!.site)
})

test('the version lives in index.json only, so bumping it never needs anything else to follow', () => {
  // hayase updates an extension when this changes. package.json and the built files carry no version of their own
  assert.equal('version' in (JSON.parse(read('../package.json')) as object), false)
  for (const entry of manifest) {
    assert.match(entry.version, /^\d+\.\d+\.\d+$/)
    assert.doesNotMatch(read(`../public/${expected[entry.id]!.file}`).split('\n')[0]!, /\d+\.\d+\.\d+/)
  }
})

test('the built files the manifest points at exist', () => {
  for (const entry of manifest) assert.ok(existsSync(new URL(`../public/${expected[entry.id]!.file}`, import.meta.url)))
})

test('options are typed like hayase expects', () => {
  for (const entry of manifest) {
    for (const option of Object.values(entry.options)) {
      assert.ok(['string', 'number', 'boolean', 'select'].includes(option.type))
      assert.ok(option.description.length > 0)
      assert.ok('default' in option)
    }
  }
})
