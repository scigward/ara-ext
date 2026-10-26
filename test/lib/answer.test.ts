import assert from 'node:assert/strict'
import { test } from 'node:test'

import { maxFiles, unique } from '../../src/lib/answer.ts'

test('the number of files stays between 1 and 8, and 3 when it is not a number', () => {
  assert.equal(maxFiles({}), 3)
  assert.equal(maxFiles({ maxFiles: 'abc' }), 3)
  assert.equal(maxFiles({ maxFiles: 20 }), 8)
  assert.equal(maxFiles({ maxFiles: -3 }), 1)
  assert.equal(maxFiles({ maxFiles: 2.4 }), 2)
})

test('the same label twice gets a number on the next ones', () => {
  assert.deepEqual(unique(['a.ass', 'a.ass', 'b.ass', 'a.ass']), ['a.ass', 'a 2.ass', 'b.ass', 'a 3.ass'])
})
