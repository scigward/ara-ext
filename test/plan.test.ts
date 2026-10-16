import assert from 'node:assert/strict'
import { test } from 'node:test'

import { maxFiles, plan } from '../src/plan.ts'

import type { Block } from '../src/listing.ts'
import type { SubtitleQuery } from '../src/types.ts'

const block = (episodes: Array<[number, number]>, zip = 'z'): Block => ({ episodes, release: '', translators: [], zip })
const query = (extra: Partial<SubtitleQuery> = {}): SubtitleQuery => ({ anilistId: 1, episode: 5, titles: [], fetch, ...extra })

test('the number of files stays between 1 and 8, and 3 when it is not a number', () => {
  assert.equal(maxFiles({}), 3)
  assert.equal(maxFiles({ maxFiles: 'abc' }), 3)
  assert.equal(maxFiles({ maxFiles: 20 }), 8)
  assert.equal(maxFiles({ maxFiles: -3 }), 1)
  assert.equal(maxFiles({ maxFiles: 2.4 }), 2)
})

test('only the zips that list the episode, in the order of the page', () => {
  const steps = plan([block([[1, 4]], 'early'), block([[5, 5]], 'one'), block([[1, 12]], 'all')], query(), {})
  assert.deepEqual(steps.map(step => step.block.zip), ['one', 'all'])
})

test('a zip for one episode is lone, and the one range a page lists goes along as the span', () => {
  const [one, range, several] = plan([block([[5, 5]]), block([[1, 12]]), block([[4, 4], [5, 5]])], query(), {})
  assert.deepEqual([one!.lone, one!.span], [true, [5, 5]])
  assert.deepEqual([range!.lone, range!.span], [false, [1, 12]])
  assert.deepEqual([several!.lone, several!.span], [false, undefined])
})

test('the series-wide number is the fallback when the plain one has no zip', () => {
  const steps = plan([block([[23, 23]], 'later')], query({ episode: 1, absoluteEpisodeNumber: 23 }), {})
  assert.deepEqual(steps.map(step => step.block.zip), ['later'])
  assert.deepEqual(steps[0]!.episodes, [1, 23])
})

test('the series-wide number is left out when it says the same, or when it is not there', () => {
  assert.deepEqual(plan([block([[5, 5]])], query({ absoluteEpisodeNumber: 5 }), {})[0]!.episodes, [5, undefined])
  assert.deepEqual(plan([block([[5, 5]])], query({ absoluteEpisodeNumber: null }), {})[0]!.episodes, [5, undefined])
})

test('a movie takes the zips that name no episode', () => {
  const zips = [block([], 'film'), block([[1, 3]], 'series')]
  assert.deepEqual(plan(zips, query({ episodeCount: 1 }), {}).map(step => [step.block.zip, step.lone]), [['film', true]])
  assert.deepEqual(plan(zips, query({ media: { format: 'MOVIE' } }), {}).map(step => step.block.zip), ['film'])
  assert.deepEqual(plan(zips, query(), {}), [])
})

test('two spares come after the files that are wanted', () => {
  const zips = Array.from({ length: 10 }, (_, i) => block([[5, 5]], `zip-${i}`))
  assert.equal(plan(zips, query(), {}).length, 5)
  assert.equal(plan(zips, query(), { maxFiles: 1 }).length, 3)
})
