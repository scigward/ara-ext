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
  options: Record<string, { type: string, description: string, default: unknown }>
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const manifest = JSON.parse(read('../index.json')) as Entry[]
const { version } = JSON.parse(read('../package.json')) as { version: string }

test('the manifest has what hayase insists on when importing', () => {
  assert.equal(manifest.length, 1)
  const [entry] = manifest
  for (const key of ['name', 'version', 'id', 'type', 'accuracy', 'icon', 'update', 'code']) assert.ok(key in entry!, key)
  assert.equal(entry!.type, 'subtitle')
  assert.equal(entry!.manifestVersion, 2)
})

test('update and code point at this repo, the icon is the favicon of the site itself', () => {
  const [entry] = manifest
  for (const url of [entry!.update, entry!.code]) assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/scigward\/Mirai-ext\/main\//)
  assert.ok(entry!.update.endsWith('/index.json'))
  assert.ok(entry!.code.endsWith('/dist/mirai.js'))
  // no artwork of our own in this repo
  assert.match(entry!.icon, /^https:\/\/miraianime\.net\/wp-content\/uploads\/[^/]+\.png$/)
})

test('a new version of the code is a new version of the manifest, or hayase never updates', () => {
  assert.equal(manifest[0]!.version, version)
  assert.match(read('../dist/mirai.js'), new RegExp(`^// mirai-ext ${version.replaceAll('.', '\\.')},`))
})

test('the built file the manifest points at exists', () => {
  assert.ok(existsSync(new URL('../dist/mirai.js', import.meta.url)))
})

test('options are typed like hayase expects', () => {
  for (const option of Object.values(manifest[0]!.options)) {
    assert.ok(['string', 'number', 'boolean', 'select'].includes(option.type))
    assert.ok(option.description.length > 0)
    assert.ok('default' in option)
  }
})
