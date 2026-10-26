import assert from 'node:assert/strict'
import { test } from 'node:test'

import subsource from '../../src/subsource/index.ts'
import { fakeSite } from '../helpers/server.ts'
import { buildZip } from '../helpers/zipbuilder.ts'

import type { SubtitleQuery } from '../../src/lib/types.ts'

const KEY = 'not-a-real-key'
const API = 'https://api.subsource.net/api/v1'
const ANIZIP = 'https://api.ani.zip/mappings?anilist_id=142329'
const srt = (line: string) => `1\r\n00:00:01,000 --> 00:00:02,000\r\n${line}\r\n`

type Routes = Parameters<typeof fakeSite>[0]

function routes (): Routes {
  return {
    [ANIZIP]: JSON.stringify({ episodes: { 1: { seasonNumber: 3, episodeNumber: 1 } } }),
    [`${API}/movies/search?searchType=imdb&imdb=tt9335498&type=series&season=3`]: JSON.stringify({ success: true, data: [{ movieId: 7, title: 'Demon Slayer', type: 'tvseries', season: 3 }] }),
    [`${API}/subtitles?movieId=7&language=arabic&limit=100&sort=popular`]: JSON.stringify({
      success: true,
      data: [
        { subtitleId: 5, releaseInfo: 'Demon Slayer S03E05' },
        { subtitleId: 1, releaseInfo: ['Demon.Slayer.S03E01.720p.HDTV', 'Demon Slayer - 01 [TV]'], contributors: [{ displayname: 'Two' }] }
      ]
    }),
    [`${API}/subtitles/1/download`]: buildZip([{ name: 'Demon.Slayer.S03E01.720p.HDTV.srt', data: srt('two') }])
  }
}

function setup (site = fakeSite(routes())) {
  const keys: Array<string | null> = []
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get('x-api-key'))
    return await site.fetch(input, init)
  }) as typeof fetch
  const query = (extra: Partial<SubtitleQuery> = {}): SubtitleQuery => ({ anilistId: 142329, episode: 1, episodeCount: 11, absoluteEpisodeNumber: 34, titles: ['Kimetsu no Yaiba: Yuukaku-hen', 'Demon Slayer'], imdbId: 'tt9335498', fetch: fetchFn, ...extra })
  return { site, query, keys, urls: () => site.hits.map(hit => hit.url) }
}

test('without a key nothing is asked', async () => {
  const { site, query } = setup()
  assert.deepEqual(await subsource.single(query(), {}), [])
  assert.deepEqual(site.hits, [])
})

test('the season from ani.zip finds the show, only the release for this episode is downloaded', async () => {
  const { query, urls, keys } = setup()
  const results = await subsource.single(query(), { subsourceKey: KEY, fonts: false })
  assert.deepEqual(results.map(r => r.language), ['Arabic - Two (Demon.Slayer.S03E01.720p.HDTV).srt'])
  assert.equal(await (await fetch(results[0]!.url)).text(), srt('two'))
  assert.ok(!urls().includes(`${API}/subtitles/5/download`), 'episode 5 is never downloaded')
  // the key goes in a header, and only to subsource
  assert.deepEqual(keys, urls().map(url => url.startsWith(API) ? KEY : null))
})

test('a text search only trusts a show with the exact title', async () => {
  const search = `${API}/movies/search?searchType=text&q=Kimetsu%20no%20Yaiba%3A%20Yuukaku-hen&type=series&season=3`
  const other = setup(fakeSite({ ...routes(), [search]: JSON.stringify({ data: [{ movieId: 7, title: 'Demon Slayer Movie', type: 'tvseries', season: 3 }] }) }))
  assert.deepEqual(await subsource.single(other.query({ imdbId: undefined }), { subsourceKey: KEY }), [])
  assert.ok(!other.urls().some(url => url.includes('/subtitles?')))

  const same = setup(fakeSite({ ...routes(), [search]: JSON.stringify({ data: [{ movieId: 7, title: 'Kimetsu no Yaiba Yuukaku-hen', type: 'tvseries', season: 3 }] }) }))
  assert.equal((await subsource.single(same.query({ imdbId: undefined }), { subsourceKey: KEY, fonts: false })).length, 1)
})

test('a movie takes any release', async () => {
  const movie = {
    ...routes(),
    [`${API}/movies/search?searchType=imdb&imdb=tt9335498&type=movie`]: JSON.stringify({ data: [{ movieId: 9, title: 'Mugen Train', type: 'movie' }] }),
    [`${API}/subtitles?movieId=9&language=arabic&limit=100&sort=popular`]: JSON.stringify({ data: [{ subtitleId: 3, releaseInfo: 'Mugen.Train.2020.1080p.BluRay' }] }),
    [`${API}/subtitles/3/download`]: buildZip([{ name: 'Mugen.Train.2020.1080p.BluRay.srt', data: srt('movie') }])
  }
  const { query } = setup(fakeSite(movie))
  const results = await subsource.single(query({ media: { format: 'MOVIE' }, episodeCount: 1 }), { subsourceKey: KEY, fonts: false })
  assert.deepEqual(results.map(r => r.language), ['Arabic - SubSource (Mugen.Train.2020.1080p.BluRay).srt'])
})

test('a refused key is told', async () => {
  const site = fakeSite(Object.fromEntries(Object.entries(routes()).map(([url, body]) => [url, url.startsWith(API) ? { status: 401 } : body])))
  await assert.rejects(subsource.single(setup(site).query(), { subsourceKey: KEY }), /SubSource did not accept the API key/)
})

test('test() is the site answering at all', async () => {
  const real = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('SubSource!')
    assert.equal(await subsource.test(), true)
    globalThis.fetch = async () => { throw new TypeError('failed to fetch') }
    await assert.rejects(subsource.test(), /Could not reach https:\/\/api\.subsource\.net/)
  } finally {
    globalThis.fetch = real
  }
})
