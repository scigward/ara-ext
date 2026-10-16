import assert from 'node:assert/strict'
import { test } from 'node:test'

import { label, unique } from '../src/label.ts'

import type { Block } from '../src/listing.ts'
import type { Picked } from '../src/names.ts'

const file = (extra: Partial<Picked> = {}): Picked => ({ path: 'a.ass', format: 'ass', strong: true, tags: [], title: 'a', version: 1, mixed: false, ...extra })
const block = (extra: Partial<Block> = {}): Block => ({ episodes: [], release: '', translators: [], zip: 'z', ...extra })

test('the label ends in the extension, hayase reads the type from it', () => {
  assert.equal(label(file(), block(), 'srt'), 'Arabic - Mirai.srt')
})

test('the translators of the page are the credit, then the group in the file name', () => {
  assert.equal(label(file(), block({ translators: ['A', 'B'] }), 'ass'), 'Arabic - A & B.ass')
  assert.equal(label(file({ group: 'Foo' }), block(), 'ass'), 'Arabic - Foo.ass')
  assert.equal(label(file({ group: 'Foo' }), block({ translators: ['A'] }), 'ass'), 'Arabic - A.ass')
})

test('in a mixed zip the file name knows who made the file better than the page does', () => {
  const page = block({ translators: ['A', 'B'] })
  assert.equal(label(file({ mixed: true, group: 'Foo' }), page, 'ass'), 'Arabic - Foo.ass')
  assert.equal(label(file({ mixed: true }), page, 'ass'), 'Arabic - A & B.ass')
})

test('the release and the extra tags follow the credit', () => {
  assert.equal(label(file(), block({ release: 'BD' }), 'ass', '1080p'), 'Arabic - Mirai (BD) 1080p.ass')
})

test('characters a file name cannot hold become one space, and long credits are cut', () => {
  assert.equal(label(file(), block({ translators: ['A/B:C*  D'] }), 'ass'), 'Arabic - A B C D.ass')
  assert.equal(label(file(), block({ translators: ['x'.repeat(80)] }), 'ass').length, 'Arabic - '.length + 50 + '.ass'.length)
})

test('the same label twice gets a number on the next ones', () => {
  assert.deepEqual(unique(['a.ass', 'a.ass', 'b.ass', 'a.ass']), ['a.ass', 'a 2.ass', 'b.ass', 'a 3.ass'])
})
