import assert from 'node:assert/strict'
import { test } from 'node:test'

import { noClock, startClock } from '../../src/lib/clock.ts'
import { episodeOf } from '../../src/lib/episode.ts'
import { fakeSite } from '../helpers/server.ts'

import type { FakeSite } from '../helpers/server.ts'
import type { SubtitleQuery } from '../../src/lib/types.ts'

const ANIZIP = 'https://api.ani.zip/mappings?anilist_id=142329'
const query = (site: FakeSite, extra: Partial<SubtitleQuery> = {}): SubtitleQuery => ({ anilistId: 142329, episode: 1, absoluteEpisodeNumber: 34, titles: [], fetch: site.fetch, ...extra })

test('the season and episode the tv databases use come from ani.zip', async () => {
  const site = fakeSite({ [ANIZIP]: JSON.stringify({ episodes: { 1: { seasonNumber: 3, episodeNumber: 1 } } }) })
  assert.deepEqual(await episodeOf(query(site), noClock), { movie: false, season: 3, episode: 1, numbers: [1, 34] })
})

test('no mapping, a broken answer or no ani.zip at all is season 1 and the anilist episode', async () => {
  for (const body of [JSON.stringify({ episodes: { 2: { seasonNumber: 3, episodeNumber: 2 } } }), 'not json', { status: 500 }]) {
    assert.deepEqual(await episodeOf(query(fakeSite({ [ANIZIP]: body })), noClock), { movie: false, season: 1, episode: 1, numbers: [1, 34] })
  }
})

test('a slow ani.zip does not hold the answer back', async () => {
  const site = fakeSite({ [ANIZIP]: JSON.stringify({ episodes: { 1: { seasonNumber: 3, episodeNumber: 1 } } }) }, { delay: 200 })
  assert.equal((await episodeOf(query(site), startClock(20, 'test'))).season, 1)
})

test('a movie has no season to look up', async () => {
  const site = fakeSite({})
  assert.deepEqual(await episodeOf(query(site, { media: { format: 'MOVIE' } }), noClock), { movie: true, season: 1, episode: 1, numbers: [1, 34] })
  assert.deepEqual(site.hits, [])
})
