import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { createExtension } from '../src/extension.ts'

import { badge, block, page, UPLOADS } from './helpers/pages.ts'
import { fakeSite, iosLike } from './helpers/server.ts'
import { buildZip } from './helpers/zipbuilder.ts'

import type { Hit, SiteOptions } from './helpers/server.ts'
import type { Item } from './helpers/zipbuilder.ts'
import type { SubtitleQuery } from '../src/types.ts'

const ORIGIN = 'https://miraianime.net'
const CREDITS = 'تم تحميل ملفات الترجمة من موقع ميراي انمي'
const gintama = JSON.parse(readFileSync(new URL('./fixtures/gintama-names.json', import.meta.url), 'utf8')) as string[]

const ass = (line: string) => `[Script Info]\r\nTitle: test\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,${line}\r\n`
const text = async (url: string) => await (await fetch(url)).text()

// something that does not shrink when zipped, so a zip can be big
function filler (length: number, seed: number) {
  let s = seed
  let out = ''
  for (let i = 0; i < length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    out += String.fromCharCode(97 + (s >>> 24) % 26)
  }
  return out
}

const malPage = (mal: number, slug: string) => [`${ORIGIN}/anime/?my_anime_list_ID=${mal}&submit=`, `<div><a href="${ORIGIN}/anime/${slug}/"><img></a><a href="${ORIGIN}/anime/${slug}/">title</a></div>`] as const

function kusuriya () {
  return {
    ...Object.fromEntries([malPage(61987, 'kusuriya-3')]),
    [`${ORIGIN}/subtitle/kusuriya-3/`]: page(
      block({ episodes: badge('01'), translators: ['Cr'], links: [`${UPLOADS}/Cr-01.zip`] }),
      block({ episodes: badge('01'), translators: ['Celestial Dragons'], links: [`${UPLOADS}/CD-01.zip`, 'https://miraianime.app/?file=fonts.zip&token=x'] }),
      block({ episodes: badge('02'), translators: ['Cr'], links: [`${UPLOADS}/Cr-02.zip`] })
    ),
    [`${UPLOADS}/Cr-01.zip`]: buildZip([
      { name: '[Crunchyroll] Kusuriya no Hitorigoto (2026) - 01.ass', data: ass('cr one') },
      { name: 'Mirai Anime.txt', data: CREDITS }
    ]),
    [`${UPLOADS}/CD-01.zip`]: buildZip([
      { name: 'Fonts/', data: '', method: 0 },
      { name: 'Fonts/Bahij.ttf', data: filler(3000, 3) },
      { name: '[Celestial Dragons] Kusuriya no Hitorigoto S3 - 01.ass', data: ass('cd one') },
      { name: 'Mirai Anime.txt', data: CREDITS }
    ]),
    [`${UPLOADS}/Cr-02.zip`]: buildZip([{ name: '[Crunchyroll] Kusuriya no Hitorigoto (2026) - 02.ass', data: ass('cr two') }])
  }
}

type Routes = Parameters<typeof fakeSite>[0]

function setup (routes: Routes = kusuriya(), options: SiteOptions = {}, budget?: number, grace?: number) {
  const site = fakeSite(routes, options)
  const ext = createExtension(budget, grace)
  const q = (extra: Partial<SubtitleQuery> = {}): SubtitleQuery => ({
    anilistId: 195516, malId: 61987, episode: 1, titles: ['Kusuriya no Hitorigoto 3rd Season'], fetch: iosLike(site.fetch), ...extra
  })
  return { site, ext, q }
}

test('episode 1 gives both groups, never the fonts or the credits', async () => {
  const { ext, q } = setup()
  const got = await ext.single(q())

  assert.deepEqual(got.map(g => g.language).sort(), ['Arabic - Celestial Dragons (WEB).ass', 'Arabic - Cr (WEB).ass'])
  const bodies = new Map(await Promise.all(got.map(async g => [g.language, await text(g.url)] as const)))
  assert.match(bodies.get('Arabic - Cr (WEB).ass')!, /cr one/)
  assert.match(bodies.get('Arabic - Celestial Dragons (WEB).ass')!, /cd one/)
  for (const body of bodies.values()) assert.doesNotMatch(body, /ميراي/)
  assert.ok(got.every(g => g.url.startsWith('data:text/x-ssa;charset=utf-8;base64,')))
})

test('links are made when the answer is handed over, so a remembered answer gets a fresh one', async () => {
  const site = fakeSite(kusuriya())
  const made: string[] = []
  const ext = createExtension(undefined, undefined, (_, format) => `link-${made.push(format)}`)
  const query: SubtitleQuery = { anilistId: 195516, malId: 61987, episode: 2, titles: ['Kusuriya no Hitorigoto 3rd Season'], fetch: iosLike(site.fetch) }

  assert.deepEqual((await ext.single(query)).map(r => r.url), ['link-1'])
  const requests = site.hits.length
  assert.deepEqual((await ext.single(query)).map(r => r.url), ['link-2'])
  assert.equal(site.hits.length, requests)
})

test('the language string always ends in a type hayase accepts', async () => {
  const { ext, q } = setup()
  for (const { language } of await ext.single(q())) assert.match(language, /^[^/\\:]+\.(ass|ssa|srt|vtt|sub)$/)
})

test('episode 2 only has the other zip, and the fonts host is never touched', async () => {
  const { ext, q, site } = setup()
  const got = await ext.single(q({ episode: 2 }))
  assert.deepEqual(got.map(g => g.language), ['Arabic - Cr (WEB).ass'])
  assert.ok(!site.hits.some(h => h.url.includes('miraianime.app')))
  assert.ok(!site.hits.some(h => h.url.endsWith('CD-01.zip')))
})

test('an episode nobody covers opens no zips at all', async () => {
  const { ext, q, site } = setup()
  assert.deepEqual(await ext.single(q({ episode: 9 })), [])
  assert.ok(!site.hits.some(h => h.url.includes('.zip')))
})

test('asking again is answered from memory', async () => {
  const { ext, q, site } = setup()
  const first = await ext.single(q())
  const requests = site.hits.length
  assert.deepEqual(await ext.single(q()), first)
  assert.equal(site.hits.length, requests)
})

test('another episode of the same anime skips the lookup and the listing', async () => {
  const { ext, q, site } = setup()
  await ext.single(q())
  site.hits.length = 0
  await ext.single(q({ episode: 2 }))
  assert.deepEqual(site.hits.map(h => h.url), [`${UPLOADS}/Cr-02.zip`])
})

function mixed () {
  const files = gintama.filter(n => n.endsWith('.ass')).map((name, i) => ({ name, data: ass(`line ${i}`) + `; ${filler(900, i + 1)}\r\n` }))
  return {
    ...Object.fromEntries([malPage(918, 'gintama')]),
    [`${ORIGIN}/subtitle/gintama/`]: page(block({
      episodes: `${badge('001')} إلى ${badge('201')} <i class="fa-duotone fa-check-double"></i>`,
      size: '4.58 ميجابايت',
      release: 'BD',
      translators: ['Dantalin Sub', 'Kyntama', 'Laze'],
      links: [`${UPLOADS}/Mix-Gintama-001-201-BD.zip`]
    })),
    [`${UPLOADS}/Mix-Gintama-001-201-BD.zip`]: buildZip([...files, { name: 'www.Mirai.ai.txt', data: CREDITS }])
  }
}

test('a zip of many groups hands over each group for the episode, by range requests', async () => {
  const { ext, q, site } = setup(mixed())
  const query = { anilistId: 918, malId: 918, titles: ['Gintama'] }

  const two = await ext.single(q({ ...query, episode: 64 }))
  assert.deepEqual(two.map(g => g.language).sort(), ['Arabic - Laze (BD).ass', 'Arabic - Re Creators Team (BD).ass'])

  const zipHits = site.hits.filter(h => h.url.endsWith('.zip'))
  assert.ok(zipHits.length <= 4, `${zipHits.length} zip requests`)
  assert.ok(zipHits.every(h => h.range), 'every zip request was a range')

  // the directory is remembered, so the next episode costs one range request
  site.hits.length = 0
  const one = await ext.single(q({ ...query, episode: 2 }))
  assert.deepEqual(one.map(g => g.language), ['Arabic - Re Creators Team & Dantalin-sub (BD).ass'])
  assert.deepEqual(site.hits.map(h => h.url.endsWith('.zip')), [true])
})

test('a read that fails once is not remembered as the answer', async () => {
  const zipUrl = `${UPLOADS}/Mix-Gintama-001-201-BD.zip`
  const bytes = mixed()[zipUrl] as Uint8Array
  let failing = true
  let entryReads = 0
  const routes: Routes = {
    ...mixed(),
    // the directory comes with the tail, the files are single ranges, the second of those breaks on the first call
    [zipUrl]: (hit: Hit) => {
      if (failing && !hit.range!.startsWith('bytes=-') && ++entryReads === 2) return { status: 500 }
      return bytes
    }
  }
  const { ext, q } = setup(routes)
  const query = { anilistId: 918, malId: 918, titles: ['Gintama'], episode: 64 }

  assert.equal((await ext.single(q(query))).length, 1)
  failing = false
  assert.equal((await ext.single(q(query))).length, 2)
})

test('a small zip comes whole with one request, a big one by ranges', async () => {
  const zip = `${UPLOADS}/Small.zip`
  const bytes = buildZip([{ name: '[G] Show - 05.ass', data: ass(filler(150000, 9)) }, { name: 'Mirai Anime.txt', data: CREDITS }])
  const small = setup({
    ...Object.fromEntries([malPage(1, 'one')]),
    [`${ORIGIN}/subtitle/one/`]: page(block({ episodes: badge('05'), size: `${Math.round(bytes.length / 1024)} كيلوبايت`, links: [zip] })),
    [zip]: bytes
  })
  assert.equal((await small.ext.single(small.q({ ...query, episode: 5 }))).length, 1)
  const hits = small.site.hits.filter(h => h.url === zip)
  assert.equal(hits.length, 1)
  assert.ok(Number(hits[0]!.range!.slice('bytes=-'.length)) > bytes.length)
})

test('a double episode file answers both episodes, a v2 file is found', async () => {
  const { ext, q } = setup(mixed())
  const query = { anilistId: 918, malId: 918, titles: ['Gintama'] }
  const first = await ext.single(q({ ...query, episode: 1 }))
  const second = await ext.single(q({ ...query, episode: 2 }))
  assert.equal(await text(first[0]!.url), await text(second[0]!.url))
  assert.deepEqual((await ext.single(q({ ...query, episode: 110 }))).map(g => g.language), ['Arabic - Re Creators Team & Slam-Dunk (BD).ass'])
})

test('without a myanimelist id the rest search finds it by the ids on the page', async () => {
  const url = `${ORIGIN}/wp-json/wp/v2/anime?search=${encodeURIComponent('Kusuriya no Hitorigoto 3rd Season')}&per_page=10&_fields=slug,title,acf.external_links`
  const row = (slug: string, links: object) => ({ slug, title: { rendered: 'Kusuriya no Hitorigoto 3rd Season' }, acf: { external_links: links } })
  const { ext, q } = setup({ ...kusuriya(), [url]: JSON.stringify([row('kusuriya-2', { anilist_id: 1 }), row('kusuriya-3', { anilist_id: '195516' })]) })
  const got = await ext.single(q({ malId: undefined }))
  assert.equal(got.length, 2)
})

test('titles alone are trusted only when exactly one candidate matches', async () => {
  const url = `${ORIGIN}/wp-json/wp/v2/anime?search=${encodeURIComponent('Kusuriya no Hitorigoto 3rd Season')}&per_page=10&_fields=slug,title,acf.external_links`
  const row = (slug: string, title: string) => ({ slug, title: { rendered: title }, acf: { external_links: {} } })

  const one = setup({ ...kusuriya(), [url]: JSON.stringify([row('kusuriya-3', 'Kusuriya no Hitorigoto 3rd Season'), row('x', 'Something Else')]) })
  assert.equal((await one.ext.single(one.q({ malId: undefined }))).length, 2)

  const two = setup({ ...kusuriya(), [url]: JSON.stringify([row('kusuriya-3', 'Kusuriya no Hitorigoto 3rd Season'), row('dupe', 'Kusuriya no Hitorigoto 3rd Season!')]) })
  assert.deepEqual(await two.ext.single(two.q({ malId: undefined })), [])
})

test('an anime the site does not have gives nothing, and is not asked about again', async () => {
  const url = `${ORIGIN}/wp-json/wp/v2/anime?search=${encodeURIComponent('Nobody Knows')}&per_page=10&_fields=slug,title,acf.external_links`
  const { ext, q, site } = setup({ [`${ORIGIN}/anime/?my_anime_list_ID=5&submit=`]: '<html></html>', [url]: '[]' })
  const query = { anilistId: 5, malId: 5, titles: ['Nobody Knows', 'ダレモシラナイ'] }
  assert.deepEqual(await ext.single(q(query)), [])
  const requests = site.hits.length
  assert.deepEqual(await ext.single(q(query)), [])
  assert.equal(site.hits.length, requests)
  // the japanese title is never sent to a search that cannot read it
  assert.ok(!site.hits.some(h => h.url.includes('%E3%83')))
})

test('an anime without a subtitle page yet gives nothing and no error', async () => {
  const routes = kusuriya()
  delete (routes as Record<string, unknown>)[`${ORIGIN}/subtitle/kusuriya-3/`]
  const { ext, q } = setup(routes)
  assert.deepEqual(await ext.single(q()), [])
})

test('a zip that is gone is skipped, the rest still comes', async () => {
  const routes = kusuriya()
  delete (routes as Record<string, unknown>)[`${UPLOADS}/CD-01.zip`]
  const { ext, q } = setup(routes)
  assert.deepEqual((await ext.single(q())).map(g => g.language), ['Arabic - Cr (WEB).ass'])
})

test('when every zip is gone there is nothing to report', async () => {
  const routes = kusuriya()
  delete (routes as Record<string, unknown>)[`${UPLOADS}/Cr-01.zip`]
  delete (routes as Record<string, unknown>)[`${UPLOADS}/CD-01.zip`]
  const { ext, q } = setup(routes)
  assert.deepEqual(await ext.single(q()), [])
})

// one anime page and one zip, enough to try how a zip is read
function single (zipName: string, episodes: string, files: Item[], extra: { release?: string, translators?: string[] } = {}) {
  const zip = `${UPLOADS}/${zipName}`
  return setup({
    ...Object.fromEntries([malPage(1, 'one')]),
    [`${ORIGIN}/subtitle/one/`]: page(block({ episodes, links: [zip], ...extra })),
    [zip]: buildZip(files)
  })
}
const srt = '1\r\n00:00:01,000 --> 00:00:02,500\r\nمرحبا\r\n'
const query = { anilistId: 1, malId: 1, titles: ['One'] }

test('a subtitle saved as txt is read for what it is, and called by that', async () => {
  const { ext, q } = single('G-05.zip', badge('05'), [{ name: '[G] Show - 05 [720p].txt', data: srt }, { name: 'Mirai Anime.txt', data: CREDITS }])
  const got = await ext.single(q({ ...query, episode: 5 }))
  assert.deepEqual(got.map(g => g.language), ['Arabic - Cr (WEB).srt'])
  assert.equal(await text(got[0]!.url), srt)
})

test('an srt that is really an ass file is called ass', async () => {
  const { ext, q } = single('G-05.zip', badge('05'), [{ name: '[G] Show - 05.srt', data: ass('hi') }])
  assert.deepEqual((await ext.single(q({ ...query, episode: 5 }))).map(g => g.language), ['Arabic - Cr (WEB).ass'])
})

test('two files of one movie in different resolutions are told apart', async () => {
  const { ext, q } = single('Tsubas.zip', badge('01'), [
    { name: '[Tsubas] Jin-Rou [1080p][BD].ass', data: ass('a') },
    { name: '[Tsubas] Jin-Rou [2160p][BD].ass', data: ass('b') },
    { name: 'Mirai Anime.txt', data: CREDITS }
  ], { release: 'BD', translators: ['Tsubas'] })
  const got = await ext.single(q({ ...query, episode: 1 }))
  assert.deepEqual(got.map(g => g.language).sort(), ['Arabic - Tsubas (BD) 1080p.ass', 'Arabic - Tsubas (BD) 2160p.ass'])
})

test('files that would still be called the same get a number', async () => {
  const { ext, q } = single('A.zip', badge('01'), [{ name: 'One.ass', data: ass('a') }, { name: 'Two.ass', data: ass('b') }])
  assert.deepEqual((await ext.single(q({ ...query, episode: 1 }))).map(g => g.language), ['Arabic - Cr (WEB).ass', 'Arabic - Cr (WEB) 2.ass'])
})

test('a batch numbered through the whole series is read by the number inside the season', async () => {
  const files = Array.from({ length: 22 }, (_, i) => ({ name: `[Rhythm] Lion - ${23 + i} [S2-${String(i + 1).padStart(2, '0')}].ass`, data: ass(`line ${i + 1}`) }))
  const { ext, q } = single('Rhythm.zip', `${badge('01')} إلى ${badge('22')}`, files)
  const got = await ext.single(q({ ...query, episode: 1, absoluteEpisodeNumber: 23 }))
  assert.equal(got.length, 1)
  assert.match(await text(got[0]!.url), /line 1\b/)
  assert.match(await text((await ext.single(q({ ...query, episode: 22 })))[0]!.url), /line 22\b/)
})

test('a page that numbers its episodes through the series is found by the series-wide number', async () => {
  const files = Array.from({ length: 12 }, (_, i) => ({ name: `[Rhythm] Lion - ${13 + i}.ass`, data: ass(`line ${13 + i}`) }))
  const { ext, q } = single('Rhythm.zip', `${badge('13')} إلى ${badge('24')}`, files)
  assert.match(await text((await ext.single(q({ ...query, episode: 1, absoluteEpisodeNumber: 13 })))[0]!.url), /line 13\b/)
  assert.deepEqual(await ext.single(q({ ...query, episode: 1 })), [])
})

test('a movie page that says OVA instead of a number still answers a one episode query', async () => {
  const { ext, q } = single('Movie.zip', badge('OVA'), [{ name: '[G] Movie.ass', data: ass('hi') }])
  assert.equal((await ext.single(q({ ...query, episode: 1, episodeCount: 1 }))).length, 1)
  assert.equal((await ext.single(q({ ...query, episode: 1, episodeCount: 12 }))).length, 0)
  assert.equal((await ext.single(q({ ...query, episode: 1, media: { format: 'MOVIE' } }))).length, 1)
})

test('a zip of zips, one per episode, is opened one level down', async () => {
  const inner = (episode: number) => buildZip([{ name: `[Crunchyroll] Boruto - ${String(episode).padStart(3, '0')}.ass`, data: ass(`inner ${episode}`) }, { name: 'Mirai.ai.txt', data: CREDITS }])
  const { ext, q } = single('Boruto.zip', `${badge('001')} إلى ${badge('293')}`, [
    { name: 'Boruto - 001 [BD][Crunchyroll & Zero-Kon & Almighty].zip', data: inner(1), method: 0 },
    { name: 'Boruto - 002 [BD][Crunchyroll & Almighty].zip', data: inner(2), method: 0 },
    { name: 'www.Mirai.ai.txt', data: CREDITS }
  ], { release: 'BD', translators: ['Zero-Kon', 'Almighty'] })

  const got = await ext.single(q({ ...query, episode: 2 }))
  assert.deepEqual(got.map(g => g.language), ['Arabic - Crunchyroll & Almighty (BD).ass'])
  assert.match(await text(got[0]!.url), /inner 2\b/)
})

test('a number series-wide in a lone file does not stop it being the file, and a zip numbered its own way is read by position', async () => {
  const lone = single('Espadas.zip', badge('06'), [{ name: '[ESPADAS] Bleach - 46.ass', data: ass('forty six') }, { name: 'Arial.ttf', data: filler(500, 4) }])
  assert.match(await text((await lone.ext.single(lone.q({ ...query, episode: 6 })))[0]!.url), /forty six\b/)

  const files = Array.from({ length: 12 }, (_, i) => ({ name: `[Rhythm] Re Zero - ${39 + i} [S2-${14 + i}].ass`, data: ass(`line ${39 + i}`) }))
  const part = single('Rhythm.zip', `${badge('01')} إلى ${badge('12')}`, files)
  assert.match(await text((await part.ext.single(part.q({ ...query, episode: 1 })))[0]!.url), /line 39\b/)
  assert.match(await text((await part.ext.single(part.q({ ...query, episode: 12 })))[0]!.url), /line 50\b/)
})

test('the same episode from two streaming services is told apart by the tag only one has', async () => {
  const { ext, q } = single('Shahid.zip', badge('01'), [
    { name: '[Shahid] Bleach - 41 (407) [AMZN][VARYG].ass', data: ass('a') },
    { name: '[Shahid] Bleach - 41 (407) [DSNP][VARYG].ass', data: ass('b') }
  ], { translators: ['Shahid'] })
  assert.deepEqual((await ext.single(q({ ...query, episode: 1 }))).map(g => g.language).sort(), ['Arabic - Shahid (WEB) AMZN.ass', 'Arabic - Shahid (WEB) DSNP.ass'])
})

test('a file too big to be worth opening is left out without a word', async () => {
  const huge = single('Huge.zip', badge('01'), [{ name: '[G] Show - 01.ass', data: ass('x'), claimSize: 50 * 1024 * 1024 }])
  assert.deepEqual(await huge.ext.single(huge.q({ ...query, episode: 1 })), [])
})

test('a zip with no subtitle for the episode, or only credits, gives nothing', async () => {
  const { ext, q } = setup({ ...kusuriya(), [`${UPLOADS}/Cr-01.zip`]: buildZip([{ name: 'Mirai Anime.txt', data: CREDITS }]), [`${UPLOADS}/CD-01.zip`]: buildZip([{ name: 'Show - 07.ass', data: ass('x') }, { name: 'Show - 08.ass', data: ass('y') }]) })
  assert.deepEqual(await ext.single(q()), [])
})

test('a real problem is told, not swallowed', async () => {
  const down = setup({ [`${ORIGIN}/anime/?my_anime_list_ID=61987&submit=`]: { status: 500 } })
  await assert.rejects(down.ext.single(down.q()), /500/)

  const challenge = setup({ ...kusuriya(), [`${ORIGIN}/subtitle/kusuriya-3/`]: { status: 503, body: '<title>Just a moment...</title>' } })
  await assert.rejects(challenge.ext.single(challenge.q()), /cloudflare/)

  const broken = setup({ ...kusuriya(), [`${UPLOADS}/Cr-01.zip`]: '<html>not a zip</html>', [`${UPLOADS}/CD-01.zip`]: '<html>not a zip</html>' })
  await assert.rejects(broken.ext.single(broken.q()), /not a zip/)
})

test('a slow zip does not take the fast one down with it', async () => {
  const { ext, q } = setup(kusuriya(), { delays: { 'CD-01.zip': 1500 } }, 700)
  const got = await ext.single(q())
  assert.deepEqual(got.map(g => g.language), ['Arabic - Cr (WEB).ass'])
})

test('a slow zip is not waited for once another one has answered', async () => {
  const { ext, q } = setup(kusuriya(), { delays: { 'CD-01.zip': 3000 } }, 8000, 100)
  const started = Date.now()
  assert.deepEqual((await ext.single(q())).map(g => g.language), ['Arabic - Cr (WEB).ass'])
  assert.ok(Date.now() - started < 1500)
})

test('a site that is too slow to even list is an error the user can read', async () => {
  const { ext, q } = setup(kusuriya(), { delay: 300 }, 400)
  await assert.rejects(ext.single(q()), /took too long/)
})

test('maxFiles caps the answer and translators picks who comes first', async () => {
  const { ext, q } = setup()
  assert.equal((await ext.single(q(), { maxFiles: 1 })).length, 1)
  assert.equal((await ext.single(q(), { translators: 'celestial' }))[0]!.language, 'Arabic - Celestial Dragons (WEB).ass')
  assert.equal((await ext.single(q(), { translators: 'cr, celestial' }))[0]!.language, 'Arabic - Cr (WEB).ass')
})

test('test() says yes when the site answers with json', async () => {
  const real = globalThis.fetch
  const ext = createExtension()
  try {
    globalThis.fetch = (async () => new Response('[{"id":1}]')) as typeof fetch
    assert.equal(await ext.test(), true)
    globalThis.fetch = (async () => new Response('{"nope":1}')) as typeof fetch
    await assert.rejects(ext.test(), /unexpected/)
    globalThis.fetch = (async () => new Response('x', { status: 500 })) as typeof fetch
    await assert.rejects(ext.test(), /500/)
  } finally {
    globalThis.fetch = real
  }
})
