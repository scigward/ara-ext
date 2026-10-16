import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import { cache } from '../src/cache.ts'

// the cache reads Date.now, so time is moved by hand
function withClock (body: () => void) {
  mock.timers.enable({ apis: ['Date'] })
  try {
    body()
  } finally {
    mock.timers.reset()
  }
}

test('a value comes back until its time is up', () => withClock(() => {
  const memory = cache<string>(1000)
  assert.equal(memory.set('a', 'one'), 'one')
  mock.timers.tick(999)
  assert.equal(memory.get('a'), 'one')
  mock.timers.tick(2)
  assert.equal(memory.get('a'), undefined)
}))

test('one value can live shorter than the rest', () => withClock(() => {
  const memory = cache<string>(1000)
  memory.set('short', 'x', 100)
  memory.set('long', 'y')
  mock.timers.tick(101)
  assert.equal(memory.get('short'), undefined)
  assert.equal(memory.get('long'), 'y')
}))

test('the oldest goes first when there is no room', () => {
  const memory = cache<number>(1000, 2)
  memory.set('a', 1)
  memory.set('b', 2)
  memory.set('c', 3)
  assert.deepEqual(['a', 'b', 'c'].map(key => memory.get(key)), [undefined, 2, 3])
})

test('setting a key again makes it the newest', () => {
  const memory = cache<number>(1000, 2)
  memory.set('a', 1)
  memory.set('b', 2)
  memory.set('a', 10)
  memory.set('c', 3)
  assert.deepEqual(['a', 'b', 'c'].map(key => memory.get(key)), [10, undefined, 3])
})
