import assert from 'node:assert/strict'
import { test } from 'node:test'

import { startClock } from '../src/clock.ts'
import { findSlug, slugCache, squash } from '../src/resolve.ts'

import { fakeSite, iosLike } from './helpers/server.ts'

import type { SiteOptions } from './helpers/server.ts'
import type { SubtitleQuery } from '../src/types.ts'

const ORIGIN = 'https://miraianime.net'
const TITLE = 'Kusuriya no Hitorigoto 3rd Season'
const FIELDS = '&_fields=slug,title,acf.external_links'

const malUrl = (mal: number) => `${ORIGIN}/anime/?my_anime_list_ID=${mal}&submit=`
const searchUrl = (term: string) => `${ORIGIN}/wp-json/wp/v2/anime?search=${encodeURIComponent(term)}&per_page=10${FIELDS}`
const slugUrl = (slug: string) => `${ORIGIN}/wp-json/wp/v2/anime?slug=${slug}${FIELDS}`
const link = (slug: string) => `<a href="${ORIGIN}/anime/${slug}/">x</a>`
const row = (slug: string, links: object, title = TITLE) => ({ slug, title: { rendered: title }, acf: { external_links: links } })
const json = (...rows: object[]) => JSON.stringify(rows)

function setup (routes: Parameters<typeof fakeSite>[0], options: SiteOptions = {}) {
  const site = fakeSite(routes, options)
  const slugs = slugCache()
  const find = (extra: Partial<SubtitleQuery> = {}, budget = 5000) => findSlug(
    { anilistId: 195516, malId: 61987, episode: 1, titles: [TITLE], fetch: iosLike(site.fetch), ...extra }, startClock(budget), slugs)
  return { site, find }
}

test('titles meet when only letters and digits are compared', () => {
  assert.equal(squash('Gintama°: Foo-Bar!'), squash('gintama foo bar'))
  assert.equal(squash('Ūsagi'), squash('usagi'))
})

test('the quick title search wins while the id filter is still being built', async () => {
  const { find } = setup({
    [malUrl(61987)]: link('kusuriya-3'),
    [searchUrl(TITLE)]: json(row('kusuriya-3', { anilist_id: 195516, my_anime_list_id: 61987 }))
  }, { delays: { my_anime_list_ID: 400 } })
  assert.equal(await find({}, 200), 'kusuriya-3')
})

test('the id filter answers when the title search finds nothing', async () => {
  const { find } = setup({ [malUrl(61987)]: link('kusuriya-3'), [searchUrl(TITLE)]: '[]' })
  assert.equal(await find(), 'kusuriya-3')
})

test('a title search that finds the wrong anime is not believed over the filter', async () => {
  const { find } = setup({
    [malUrl(61987)]: link('kusuriya-3'),
    [searchUrl(TITLE)]: json(row('kusuriya-2', { anilist_id: 1, my_anime_list_id: 2 }))
  })
  assert.equal(await find(), 'kusuriya-3')
})

test('one lookup breaking is fine when the other finds it', async () => {
  const filterBroken = setup({ [malUrl(61987)]: { status: 500 }, [searchUrl(TITLE)]: json(row('kusuriya-3', { my_anime_list_id: '61987' })) })
  assert.equal(await filterBroken.find(), 'kusuriya-3')

  const searchBroken = setup({ [malUrl(61987)]: link('kusuriya-3') })
  assert.equal(await searchBroken.find(), 'kusuriya-3')
})

test('when both break the id filter is the one that explains', async () => {
  const { find } = setup({ [malUrl(61987)]: { status: 500 } })
  await assert.rejects(find(), /500/)
})

test('both finding nothing is not an error, and is remembered', async () => {
  const { find, site } = setup({ [malUrl(61987)]: '<html></html>', [searchUrl(TITLE)]: '[]' })
  assert.equal(await find(), undefined)
  const asked = site.hits.length
  assert.equal(await find(), undefined)
  assert.equal(site.hits.length, asked)
})

test('a title match is read from the rows already fetched, not asked for again', async () => {
  const { find, site } = setup({ [searchUrl(TITLE)]: json(row('kusuriya-3', {}), row('other', {}, 'Something Else')) })
  assert.equal(await find({ malId: undefined }), 'kusuriya-3')
  assert.equal(site.hits.length, 1)
})

test('the other titles are tried, only the latin ones', async () => {
  const { find, site } = setup({
    [searchUrl('Zzz Nothing')]: '[]',
    [searchUrl(TITLE)]: json(row('kusuriya-3', { anilist_id: 195516 }))
  })
  assert.equal(await find({ malId: undefined, titles: ['Zzz Nothing', '薬屋のひとりごと', TITLE] }), 'kusuriya-3')
  assert.deepEqual(site.hits.map(h => decodeURIComponent(h.url.split('search=')[1]!.split('&')[0]!)), ['Zzz Nothing', TITLE])
})

test('two entries on the site for one id: the ids on their pages choose', async () => {
  const { find } = setup({
    [malUrl(61987)]: link('a') + link('b'),
    [slugUrl('a')]: json(row('a', { anilist_id: 1 })),
    [slugUrl('b')]: json(row('b', { anilist_id: 195516 }))
  })
  assert.equal(await find(), 'b')
})

test('the anidb id and the myanimelist id on the page count as proof too', async () => {
  const a = setup({ [searchUrl(TITLE)]: json(row('x', { anidb_id: '19444' })) })
  assert.equal(await a.find({ malId: undefined, anidbAid: 19444 }), 'x')
  const b = setup({ [searchUrl(TITLE)]: json(row('y', { my_anime_list_id: 61987 })) })
  assert.equal(await b.find({ malId: undefined, media: { idMal: 61987 } }), 'y')
})

test('a special that carries the anilist id of its series does not win over the series', async () => {
  // the site really has this: jump festa 2016 special has the anilist id of boruto
  const { find } = setup({
    [searchUrl('Boruto')]: json(row('boruto-special', { anilist_id: 97938, my_anime_list_id: 35072 }, 'Boruto: Jump Festa 2016 Special'), row('boruto', { anilist_id: 97938, my_anime_list_id: 34566 }, 'Boruto'))
  })
  assert.equal(await find({ anilistId: 97938, malId: 34566, titles: ['Boruto'] }), 'boruto')
})

test('the most ids in agreement wins when nothing else tells candidates apart', async () => {
  const { find } = setup({
    [searchUrl(TITLE)]: json(row('one-id', { anilist_id: 195516 }), row('two-ids', { anilist_id: 195516, anidb_id: 19444 }))
  })
  assert.equal(await find({ malId: undefined, anidbAid: 19444 }), 'two-ids')
})

test('with a mal id in hand an anilist id alone does not end the search, the filter has the say', async () => {
  const { find } = setup({
    [malUrl(61987)]: link('right'),
    [searchUrl(TITLE)]: json(row('wrong', { anilist_id: 195516, my_anime_list_id: 1 }))
  }, { delays: { my_anime_list_ID: 50 } })
  assert.equal(await find(), 'right')
})

test('but that anilist match is used when the filter finds nothing', async () => {
  const { find } = setup({
    [malUrl(61987)]: '<html></html>',
    [searchUrl(TITLE)]: json(row('only-anilist', { anilist_id: 195516, my_anime_list_id: 1 }))
  })
  assert.equal(await find(), 'only-anilist')
})
