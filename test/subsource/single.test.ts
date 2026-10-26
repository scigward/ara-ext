import assert from 'node:assert/strict'
import { test } from 'node:test'

import subsource from '../../src/subsource/index.ts'
import { fakeSite, strict } from '../helpers/server.ts'
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
  const send = site.fetch
  const fetchFn = strict((async (input: string | URL | Request, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get('x-api-key'))
    return await send(input, init)
  }) as typeof fetch)
  const query = (extra: Partial<SubtitleQuery> = {}): SubtitleQuery => ({ anilistId: 142329, episode: 1, episodeCount: 11, absoluteEpisodeNumber: 34, titles: ['Kimetsu no Yaiba: Yuukaku-hen', 'Demon Slayer'], imdbId: 'tt9335498|tt0000001', fetch: fetchFn, ...extra })
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

test('packs come first and give the episode out of the season under its own name, kept for the next one', async () => {
  const season = (who: string) => buildZip([4, 5, 6].map(n => ({ name: `[${who}] Demon Slayer - 0${n}.ass`, data: srt(`${who} ${n}`) })))
  const site = fakeSite({
    ...routes(),
    [ANIZIP]: JSON.stringify({ episodes: { 5: { seasonNumber: 3, episodeNumber: 5 }, 6: { seasonNumber: 3, episodeNumber: 6 } } }),
    [`${API}/subtitles?movieId=7&language=arabic&limit=100&sort=popular`]: JSON.stringify({
      data: [
        { subtitleId: 20, releaseInfo: 'Demon Slayer - 06' },
        { subtitleId: 21, releaseInfo: ['[Rhythm] Demon Slayer [12 ~ 24][BD]'] },
        { subtitleId: 22, releaseInfo: 'Demon Slayer - 05', contributors: [{ displayname: 'Single' }] },
        { subtitleId: 23, releaseInfo: 'Demon Slayer EP01A+B ~ 11End', contributors: [{ displayname: 'Kurd' }] },
        { subtitleId: 24, releaseInfo: ['Demon Slayer all season [1080p]'], contributors: [{ displayname: 'Whole' }] },
        { subtitleId: 25, releaseInfo: 'Demon Slayer - Memory Snow' }
      ]
    }),
    [`${API}/subtitles/22/download`]: buildZip([{ name: 'Demon Slayer - 05.srt', data: srt('single') }]),
    [`${API}/subtitles/23/download`]: season('Kurd'),
    [`${API}/subtitles/24/download`]: season('Whole'),
    [`${API}/subtitles/25/download`]: buildZip([{ name: 'Demon Slayer - Memory Snow.ass', data: srt('special') }])
  })
  const { query, urls } = setup(site)
  const fifth = await subsource.single(query({ episode: 5 }), { subsourceKey: KEY, fonts: false, maxFiles: 8 })
  assert.deepEqual(fifth.map(r => r.language), ['Arabic - Kurd ([Kurd] Demon Slayer - 05).srt', 'Arabic - Whole ([Whole] Demon Slayer - 05).srt', 'Arabic - Single (Demon Slayer - 05).srt'])
  assert.deepEqual(await Promise.all(fifth.map(async r => await (await fetch(r.url)).text())), [srt('Kurd 5'), srt('Whole 5'), srt('single')])
  assert.ok(!urls().some(url => /\/subtitles\/2[01]\/download/.test(url)), 'another episode and a run without it are never downloaded')

  const sixth = await subsource.single(query({ episode: 6 }), { subsourceKey: KEY, fonts: false, maxFiles: 1 })
  assert.equal(await (await fetch(sixth[0]!.url)).text(), srt('Kurd 6'))
  assert.equal(urls().filter(url => url === `${API}/subtitles/23/download`).length, 1)
})

test('a big pack is fetched again, not held in memory', async () => {
  const site = fakeSite({
    ...routes(),
    [`${API}/subtitles?movieId=7&language=arabic&limit=100&sort=popular`]: JSON.stringify({ data: [{ subtitleId: 30, releaseInfo: 'Demon Slayer all season' }] }),
    [`${API}/subtitles/30/download`]: buildZip([{ name: 'Demon Slayer - 01.ass', data: srt('big') + ' '.repeat(3 * 1024 * 1024), method: 0 }])
  })
  const { query, urls } = setup(site)
  await subsource.single(query(), { subsourceKey: KEY, fonts: false })
  assert.equal((await subsource.single(query(), { subsourceKey: KEY, fonts: false })).length, 1)
  assert.equal(urls().filter(url => url === `${API}/subtitles/30/download`).length, 2)
})

test('a show the site keeps as one season 0 is found when its season is not there', async () => {
  const site = fakeSite({
    ...routes(),
    [`${API}/movies/search?searchType=imdb&imdb=tt9335498&type=series&season=3`]: JSON.stringify({ data: [] }),
    [`${API}/movies/search?searchType=imdb&imdb=tt9335498&type=series&season=0`]: JSON.stringify({ data: [{ movieId: 7, title: 'Demon Slayer', type: 'tvseries', season: 0 }] })
  })
  const { query } = setup(site)
  assert.deepEqual((await subsource.single(query(), { subsourceKey: KEY, fonts: false })).map(r => r.language), ['Arabic - Two (Demon.Slayer.S03E01.720p.HDTV).srt'])
})

test('a release of another year is another show, and single uploads still come after packs that hold nothing', async () => {
  const empty = buildZip([{ name: 'read me.txt', data: 'thanks' }])
  const packs = [40, 41, 42, 43, 44, 45]
  const site = fakeSite({
    ...routes(),
    [`${API}/subtitles?movieId=7&language=arabic&limit=100&sort=popular`]: JSON.stringify({
      data: [
        { subtitleId: 39, releaseInfo: 'Demon.Slayer.(2011).S03.WEBRip', contributors: [{ displayname: 'Other' }] },
        ...packs.map(id => ({ subtitleId: id, releaseInfo: `Demon Slayer 2019 Complete ${id}` })),
        { subtitleId: 1, releaseInfo: 'Demon Slayer - 01 (2019)', contributors: [{ displayname: 'Two' }] }
      ]
    }),
    [`${API}/subtitles/39/download`]: buildZip([{ name: 'Demon.Slayer.(2011).S03E01.srt', data: srt('other show') }]),
    ...Object.fromEntries(packs.map(id => [`${API}/subtitles/${id}/download`, empty]))
  })
  const { query, urls } = setup(site)
  const results = await subsource.single(query({ media: { startDate: { year: 2019 } } }), { subsourceKey: KEY, fonts: false })
  assert.deepEqual(await Promise.all(results.map(async r => await (await fetch(r.url)).text())), [srt('two')])
  assert.ok(!urls().includes(`${API}/subtitles/39/download`), 'the other year is never downloaded')
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
