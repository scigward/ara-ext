import assert from 'node:assert/strict'
import { test } from 'node:test'

import subdl from '../../src/subdl/index.ts'
import { fakeSite } from '../helpers/server.ts'
import { buildZip } from '../helpers/zipbuilder.ts'

import type { SubtitleQuery } from '../../src/lib/types.ts'

const KEY = 'not-a-real-key'
const API = 'https://api.subdl.com/api/v1/subtitles'
const ANIZIP = 'https://api.ani.zip/mappings?anilist_id=142329'
const srt = (line: string) => `1\r\n00:00:01,000 --> 00:00:02,000\r\n${line}\r\n`

type Routes = Parameters<typeof fakeSite>[0]

// yuukaku-hen: anilist calls it episode 1, the tv databases season 3 episode 1.
// downloads are kept between calls, so a test that needs fresh ones gives its own folder
function routes (dl = 'subtitle'): Routes {
  return {
    [ANIZIP]: JSON.stringify({ episodes: { 1: { seasonNumber: 3, episodeNumber: 1 } } }),
    [`${API}?api_key=${KEY}&languages=AR&subs_per_page=30&type=tv&imdb_id=tt9335498&season_number=3&episode_number=1`]: JSON.stringify({
      status: true,
      subtitles: [
        { release_name: 'Demon Slayer S03 Complete', author: 'Pack', url: `/${dl}/2.zip`, season: 3, full_season: true },
        { release_name: 'Demon.Slayer.S03E01.1080p.WEB', author: 'One', url: `/${dl}/1.zip`, season: 3 },
        { release_name: 'Demon Slayer S01E01', author: 'Old', url: `/${dl}/3.zip`, season: 1 },
        { release_name: 'Demon Slayer S03E01 mirror', author: 'Mirror', url: `/${dl}/4.zip`, season: 3 }
      ]
    }),
    [`https://dl.subdl.com/${dl}/1.zip`]: buildZip([{ name: 'Demon.Slayer.S03E01.1080p.WEB.srt', data: srt('one') }]),
    [`https://dl.subdl.com/${dl}/2.zip`]: buildZip([1, 2, 3].map(n => ({ name: `Demon Slayer S03E0${n}.srt`, data: srt(`pack ${n}`) }))),
    [`https://dl.subdl.com/${dl}/4.zip`]: buildZip([{ name: 'mirror.srt', data: srt('one') }])
  }
}

function setup (site = fakeSite(routes())) {
  const query = (extra: Partial<SubtitleQuery> = {}): SubtitleQuery => ({ anilistId: 142329, episode: 1, episodeCount: 11, absoluteEpisodeNumber: 34, titles: ['Kimetsu no Yaiba: Yuukaku-hen'], imdbId: 'tt9335498|tt0000001', fetch: site.fetch, ...extra })
  return { site, query, urls: () => site.hits.map(hit => hit.url) }
}

const texts = async (results: Array<{ url: string }>) => await Promise.all(results.map(async r => await (await fetch(r.url)).text()))

test('without a key nothing is asked', async () => {
  const { site, query } = setup()
  assert.deepEqual(await subdl.single(query(), { subdlKey: '  ' }), [])
  assert.deepEqual(site.hits, [])
})

test('season and episode come from ani.zip, packs first, the episode is picked out of a pack', async () => {
  const { query, urls } = setup()
  const results = await subdl.single(query(), { subdlKey: KEY, fonts: false })
  assert.deepEqual(results.map(r => r.language), ['Arabic - Pack (Demon Slayer S03E01).srt', 'Arabic - One (Demon.Slayer.S03E01.1080p.WEB).srt'])
  assert.deepEqual(await texts(results), [srt('pack 1'), srt('one')])
  assert.ok(!urls().includes('https://dl.subdl.com/subtitle/3.zip'), 'another season is never downloaded')
  assert.ok(urls().filter(url => url.includes(KEY)).every(url => url.startsWith(API)), 'the key only goes to the api')
})

test('maxFiles caps the answer', async () => {
  const { query } = setup()
  assert.equal((await subdl.single(query(), { subdlKey: KEY, fonts: false, maxFiles: 1 })).length, 1)
})

test('without ani.zip it is season 1 and the anilist episode, without imdb it searches by name', async () => {
  const site = fakeSite({})
  const { query, urls } = setup(site)
  assert.deepEqual(await subdl.single(query({ imdbId: undefined }), { subdlKey: KEY }), [])
  assert.equal(urls()[1], `${API}?api_key=${KEY}&languages=AR&subs_per_page=30&type=tv&film_name=Kimetsu+no+Yaiba%3A+Yuukaku-hen&season_number=1&episode_number=1`)
})

test('a movie is asked for as one, with no season to look up', async () => {
  const { query, urls } = setup(fakeSite({}))
  await subdl.single(query({ media: { format: 'MOVIE' } }), { subdlKey: KEY })
  assert.deepEqual(urls(), [`${API}?api_key=${KEY}&languages=AR&subs_per_page=30&type=movie&imdb_id=tt9335498`])
})

test('a refused key is told', async () => {
  const site = fakeSite(Object.fromEntries(Object.entries(routes()).map(([url, body]) => [url, url.startsWith(API) ? { status: 403 } : body])))
  await assert.rejects(subdl.single(setup(site).query(), { subdlKey: KEY }), /SubDL did not accept the API key/)
})

test('downloads that all fail are told, one that fails next to others is not', async () => {
  const broken = (dl: string, urls: string[]) => fakeSite(Object.fromEntries(Object.entries(routes(dl)).map(([url, body]) => [url, urls.includes(url) ? { status: 500 } : body])))
  const all = broken('all', ['https://dl.subdl.com/all/1.zip', 'https://dl.subdl.com/all/2.zip', 'https://dl.subdl.com/all/4.zip'])
  await assert.rejects(subdl.single(setup(all).query(), { subdlKey: KEY }), /SubDL answered 500 for \/all\//)
  const one = broken('one', ['https://dl.subdl.com/one/1.zip'])
  assert.equal((await subdl.single(setup(one).query(), { subdlKey: KEY, fonts: false })).length, 2)
})

test('a pack is downloaded once for all its episodes', async () => {
  const anizip = { [ANIZIP]: JSON.stringify({ episodes: { 1: { seasonNumber: 3, episodeNumber: 1 }, 2: { seasonNumber: 3, episodeNumber: 2 } } }) }
  const second = `${API}?api_key=${KEY}&languages=AR&subs_per_page=30&type=tv&imdb_id=tt9335498&season_number=3&episode_number=2`
  const site = fakeSite({ ...routes('kept'), ...anizip, [second]: JSON.stringify({ subtitles: [{ release_name: 'Demon Slayer S03 Complete', author: 'Pack', url: '/kept/2.zip', season: 3, full_season: true }] }) })
  const { query, urls } = setup(site)
  await subdl.single(query(), { subdlKey: KEY, fonts: false })
  const results = await subdl.single(query({ episode: 2 }), { subdlKey: KEY, fonts: false })
  assert.deepEqual(await texts(results), [srt('pack 2')])
  assert.equal(urls().filter(url => url === 'https://dl.subdl.com/kept/2.zip').length, 1)
})

test('test() is the site answering at all', async () => {
  const real = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('{}')
    assert.equal(await subdl.test(), true)
    globalThis.fetch = async () => { throw new TypeError('failed to fetch') }
    await assert.rejects(subdl.test(), /Could not reach https:\/\/api\.subdl\.com/)
  } finally {
    globalThis.fetch = real
  }
})
