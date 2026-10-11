import assert from 'node:assert/strict'
import { test } from 'node:test'

import { gather } from '../src/gather.ts'

const later = <T>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(resolve, ms, value))
const failLater = (ms: number, message: string) => new Promise<never>((_resolve, reject) => setTimeout(reject, ms, new Error(message)))

test('everything that is quick comes back, in the order of the tasks', async () => {
  const { values, errors } = await gather([later(20, [1, 2]), Promise.resolve([3]), later(5, [4])], 1000)
  assert.deepEqual(values, [1, 2, 3, 4])
  assert.deepEqual(errors, [])
})

test('once something is in, a slow task only gets the grace period', async () => {
  const started = Date.now()
  const { values } = await gather([Promise.resolve([1]), later(1000, [2])], 40)
  assert.deepEqual(values, [1])
  assert.ok(Date.now() - started < 500)
})

test('with nothing in yet there is no grace, it waits for the tasks', async () => {
  const { values } = await gather([later(60, [] as number[]), later(120, [7])], 10)
  assert.deepEqual(values, [7])
})

test('a task that fails is reported and does not hide the others', async () => {
  const { values, errors } = await gather([failLater(5, 'boom'), later(20, ['a'])], 1000)
  assert.deepEqual(values, ['a'])
  assert.deepEqual(errors.map(e => (e as Error).message), ['boom'])
})

test('all failing or empty gives no values and the errors', async () => {
  const { values, errors } = await gather([failLater(5, 'one'), failLater(10, 'two'), Promise.resolve([])], 1000)
  assert.deepEqual(values, [])
  assert.equal(errors.length, 2)
})

test('no tasks, no waiting', async () => {
  assert.deepEqual(await gather([], 1000), { values: [], errors: [] })
})
