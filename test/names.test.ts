import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { describe, pickFiles } from '../src/names.ts'

const gintama = JSON.parse(readFileSync(new URL('./fixtures/gintama-names.json', import.meta.url), 'utf8')) as string[]

const of = (name: string) => {
  const d = describe(name)
  return d && { episodes: d.episodes, season: d.season, group: d.group, version: d.version, format: d.format }
}

test('the usual fansub name', () => {
  assert.deepEqual(of('[Crunchyroll] Kusuriya no Hitorigoto (2026) - 01.ass'), { episodes: [1, 1], season: undefined, group: 'Crunchyroll', version: 1, format: 'ass' })
  assert.deepEqual(of('[Celestial Dragons] Kusuriya no Hitorigoto S3 - 01.ass'), { episodes: [1, 1], season: undefined, group: 'Celestial Dragons', version: 1, format: 'ass' })
})

test('a year in the name is not the episode', () => {
  assert.deepEqual(of('Gintama (2006) - 007.srt')?.episodes, [7, 7])
  assert.equal(of('Some Movie (2019).srt')?.episodes, undefined)
  assert.equal(of('Some Movie 2019.srt')?.episodes, undefined)
  assert.equal(of('Some-Movie-2019.srt')?.episodes, undefined)
})

test('episode markers in their different spellings', () => {
  for (const name of ['Show S02E05.srt', 'Show.S02E05.1080p.srt', 'Show E05.ass', 'Show EP05.ass', 'Show Episode 05.ass', 'Show ep.05.ass', 'Show_05.srt', 'Show 05.srt', 'Show [05].srt', 'Show (05).srt', 'Show الحلقة 05.srt', 'Show الحلقة ٠٥.srt', 'Show 第05話.ass', 'Show - 05v2.ass', 'Show - 05 - Title.ass', '05.srt', '05 - Title.srt', 'Stars.S01E05.CR.WEB-DL.Arabic.AR.ass', 'ClassicaLoid-05-Arabic Subtitle.ass']) {
    assert.deepEqual(of(name)?.episodes, [5, 5], name)
  }
})

test('titles with numbers in them do not hide the episode', () => {
  assert.deepEqual(of('86 - Eighty Six - 05.ass')?.episodes, [5, 5])
  assert.deepEqual(of('07-Ghost 12.ass')?.episodes, [12, 12])
  assert.deepEqual(of('[Group] 3-gatsu no Lion - 14 [1080p].ass')?.episodes, [14, 14])
  assert.deepEqual(of('Mob Psycho 100 - 03.srt')?.episodes, [3, 3])
  assert.deepEqual(of('Show 2nd Season - 07 [BD 1080p].ass')?.episodes, [7, 7])
  assert.deepEqual(of('Show - 13 [x265 10bit 1080p].ass')?.episodes, [13, 13])
})

test('long episode numbers and double episodes', () => {
  assert.deepEqual(of('One Piece - 1085.ass')?.episodes, [1085, 1085])
  assert.deepEqual(of('Show - 001-002 [G].ass')?.episodes, [1, 2])
  assert.deepEqual(of('Show S01E05-E06.ass')?.episodes, [5, 6])
})

test('a batch range in a name is not one file', () => {
  assert.equal(of('Show - 001-201 [BD].ass')?.episodes, undefined)
  assert.equal(of('Show 01-12.srt')?.episodes, undefined)
  assert.equal(of('Show 01 ~ 12.srt')?.episodes, undefined)
})

test('decimals and recaps do not turn into whole episodes', () => {
  assert.equal(of('Show - 12.5.ass')?.episodes, undefined)
  assert.equal(of('Show - Recap.ass')?.episodes, undefined)
})

test('specials are numbered by sp, ova and special', () => {
  assert.deepEqual(of('[Rhythm] Grisaia no Rakuen - SP1 [BD].ass')?.episodes, [1, 1])
  assert.deepEqual(of('[Rhythm] Grisaia no Rakuen - SP5 [BD].ass')?.episodes, [5, 5])
  assert.deepEqual(of('Show OVA 2.srt')?.episodes, [2, 2])
  assert.deepEqual(of('Show Special 03.ass')?.episodes, [3, 3])
  assert.equal(of('[Miyuki] Sailor Moon SuperS Special [DVD-SMC].ass')?.episodes, undefined)
})

test('a season tag gives the number inside the season, the dash number is the series-wide one', () => {
  const a = of('[Rhythm] 3-gatsu no Lion - 23 [S2-01][720p 10bits AAC][].ass')
  assert.deepEqual([a?.episodes, a?.season, a?.group], [[23, 23], [1, 1], 'Rhythm'])
  const b = of('[WinoXa] 3-gatsu no Lion - 27 [BD](S2 - 05).ass')
  assert.deepEqual([b?.episodes, b?.season, b?.group], [[27, 27], [5, 5], 'WinoXa'])
  const c = of('[Crunchyroll] Mahoutsukai no Yome Season 2 - 13 [P2 - 01].ass')
  assert.deepEqual([c?.episodes, c?.season, c?.group], [[13, 13], [1, 1], 'Crunchyroll'])
  const d = of('[Mirai-Subs] 3-gatsu no Lion - 23 [S2-01][Arabic Subtitle].ass')
  assert.deepEqual([d?.episodes, d?.season, d?.group], [[23, 23], [1, 1], 'Mirai-Subs'])
  assert.equal(of('[Group] Show - 05 [S2].ass')?.season, undefined)
})

test('an END after the season number is still a season tag', () => {
  const d = of('[Crunchyroll] Mahoutsukai no Yome Season 2 - 24 END [P2 - 12 END].ass')
  assert.deepEqual([d?.episodes, d?.season, d?.group], [[24, 24], [12, 12], 'Crunchyroll'])
})

test('(part 1) names the episode when nothing else does, and is never taken for a group', () => {
  const one = of('[Miish3lov] Shingeki no Kyojin - The Final Season - Kanketsu-hen (Part 1).ass')
  assert.deepEqual([one?.episodes, one?.group], [[1, 1], 'Miish3lov'])
  const two = of('[Miish3lov] Shingeki no Kyojin - The Final Season - Kanketsu-hen (Part 2) [S4 - 30 END].ass')
  assert.deepEqual([two?.episodes, two?.season, two?.group], [[2, 2], [30, 30], 'Miish3lov'])
})

test('versions: a v2 tag or suffix', () => {
  assert.equal(of('Gintama - 110 [V2][Re Creators Team & Slam-Dunk][BD][Judas].ass')?.version, 2)
  assert.equal(of('Show - 05v3.ass')?.version, 3)
  assert.equal(of('Show - 05.ass')?.version, 1)
})

test('the group is the first bracket that is not a tag', () => {
  assert.equal(of('[1080p][Rhythm] Show - 05.ass')?.group, 'Rhythm')
  assert.equal(of('Show - 05 [V2][Scarlet Team][BD].ass')?.group, 'Scarlet Team')
  assert.equal(of('Show - 05 [BD][1080p].ass')?.group, undefined)
  assert.equal(of('Show - 05.ass')?.group, undefined)
  assert.equal(of('[TheX-FileSUB] Drifters - Special Edition [DVD][480p][9F49642D].ass')?.group, 'TheX-FileSUB')
})

test('only subtitles count, credits and junk do not', () => {
  for (const name of ['Mirai Anime.txt', 'www.Mirai.ai.txt', 'Mirai.ai.txt', 'Mirai Anime ..txt', 'Fonts/Bahij Nassim-Bold.ttf', 'Fonts.rar', '__MACOSX/Show - 01.ass', 'folder/._Show - 01.ass', 'Readme.txt', 'x'.repeat(500) + '.ass']) {
    assert.equal(describe(name), undefined, name)
  }
  assert.equal(describe('Show - 01.ass')?.format, 'ass')
})

test('a txt with an episode in its name is a candidate, to be read for what it is', () => {
  const d = describe('[El JOKER] Diamond no Ace - Act II - 29 [720p].txt')
  assert.deepEqual([d?.format, d?.episodes, d?.group], ['txt', [29, 29], 'El JOKER'])
})

test('every one of the 201 gintama episodes finds its file', () => {
  const mixed = pickFiles(gintama, [1], false)
  assert.equal(mixed[0]!.mixed, true)

  const expected = new Map<number, string[]>()
  const re = /Gintama - (\d{3})(?:-(\d{3}))? (?:\[V2\])?\[([^\]]*)\]\[BD\]\[Judas\]\.ass$/
  for (const p of gintama) {
    const m = re.exec(p)
    if (!m) continue
    for (let e = Number(m[1]); e <= Number(m[2] ?? m[1]); e++) expected.set(e, [...(expected.get(e) ?? []), m[3]!])
  }
  assert.equal(expected.size, 201)

  for (let episode = 1; episode <= 201; episode++) {
    const got = pickFiles(gintama, [episode], false).map(f => f.group).sort()
    assert.deepEqual(got, [...expected.get(episode)!].sort(), `episode ${episode}`)
  }
})

test('gintama specifics: shared files, two groups, v2 files', () => {
  const groups = (n: number) => pickFiles(gintama, [n], false).map(f => f.group)
  assert.deepEqual(groups(1), ['Re Creators Team & Dantalin-sub'])
  assert.deepEqual(groups(2), ['Re Creators Team & Dantalin-sub'])
  assert.deepEqual(groups(64).sort(), ['Laze', 'Re Creators Team'])
  assert.deepEqual(groups(110), ['Re Creators Team & Slam-Dunk'])
  assert.equal(pickFiles(gintama, [110], false)[0]!.version, 2)
  assert.deepEqual(groups(202), [])
})

test('the best copy wins: higher version first, then ass over srt', () => {
  const picked = pickFiles(['[A] Show - 01.srt', '[A] Show - 01.ass', '[B] Show - 01 [V2].srt', '[B] Show - 01.ass', '[C] Show - 02.ass'], [1], false)
  assert.deepEqual(picked.map(p => [p.group, p.format, p.version]).sort(), [['A', 'ass', 1], ['B', 'srt', 2]])
})

test('two releases of one group in a zip are both kept, they differ by tag', () => {
  const picked = pickFiles(['[A] Show - 01 [BD].ass', '[A] Show - 01 [WEB].ass'], [1], false)
  assert.equal(picked.length, 2)
})

test('a season tagged batch answers the in-season episode, the series-wide number is the fallback', () => {
  const names = ['[R] Lion - 23 [S2-01].ass', '[R] Lion - 24 [S2-02].ass', '[R] Lion - 25 [S2-03].ass']
  assert.deepEqual(pickFiles(names, [1, 23], false).map(f => f.path), ['[R] Lion - 23 [S2-01].ass'])
  assert.deepEqual(pickFiles(names, [2, undefined], false).map(f => f.path), ['[R] Lion - 24 [S2-02].ass'])
  // 24 is not an in-season number here, the series-wide one is what finds it
  assert.deepEqual(pickFiles(names, [24, 24], false).map(f => f.path), ['[R] Lion - 24 [S2-02].ass'])
  assert.deepEqual(pickFiles(names, [30, 25], false).map(f => f.path), ['[R] Lion - 25 [S2-03].ass'])
})

test('one wrong season tag does not lose the episode, the gap between the two numbers finds it', () => {
  // the real zip tags 26 as s2-03 where s2-04 was meant
  const names = Array.from({ length: 22 }, (_, i) => `[Rhythm] Lion - ${23 + i} [S2-${String(i + 1 === 4 ? 3 : i + 1).padStart(2, '0')}][720p].ass`)
  assert.deepEqual(pickFiles(names, [4, undefined], false).map(f => f.episodes), [[26, 26]])
  assert.deepEqual(pickFiles(names, [3, undefined], false).map(f => f.episodes), [[25, 25]])
  assert.equal(pickFiles(names, [22, undefined], false).length, 1)
})

test('when the page numbers like the plain number and not like the season tag, the plain number wins', () => {
  // part 2 of the final season: the page says 1 to 12, the names say 01 to 12 and carry s4-17 to s4-28 besides
  const names = Array.from({ length: 12 }, (_, i) => `[Hero Kan] Shingeki no Kyojin Part 2 - ${String(i + 1).padStart(2, '0')} (S4-${17 + i}).ass`)
  assert.deepEqual(pickFiles(names, [1, undefined], false, [1, 12]).map(f => f.episodes), [[1, 1]])
  assert.deepEqual(pickFiles(names, [12, undefined], false, [1, 12]).map(f => f.episodes), [[12, 12]])
  // without the page's range, the season tags are tried first and the plain numbers after them
  assert.deepEqual(pickFiles(names, [1, undefined], false).map(f => f.episodes), [[1, 1]])
  assert.deepEqual(pickFiles(names, [20, undefined], false).map(f => f.episodes), [[4, 4]])
})

test('a gap is only trusted when nearly every tagged file agrees', () => {
  // two seasons in one zip, the numbers inside each are what the tags say
  const names = [...Array.from({ length: 4 }, (_, i) => `[G] Show - ${i + 1} [S1-${i + 1}].ass`), ...Array.from({ length: 4 }, (_, i) => `[G] Show - ${i + 5} [S2-${i + 1}].ass`)]
  assert.equal(pickFiles(names, [2, undefined], false).length, 2)
})

test('without season tags the series-wide fallback only kicks in when the plain number finds nothing', () => {
  assert.deepEqual(pickFiles(['Show - 13.ass', 'Show - 14.ass'], [1, 13], false).map(f => f.episodes), [[13, 13]])
  assert.deepEqual(pickFiles(['Show - 01.ass', 'Show - 13.ass'], [1, 13], false).map(f => f.episodes), [[1, 1]])
})

test('"1 and 2" at the end of a name is a double episode', () => {
  assert.deepEqual(of("[Kalaacom] Ayane's High Kick - Round 1 and 2.ass")?.episodes, [1, 2])
})

test('a zip for one episode hands over what it has, however the file is named', () => {
  // the title starts with a number, which is no episode
  assert.equal(pickFiles(['[kalaacom] 009 RE-CYBORG [BD 720p 10bit AAC].ass', 'Mirai.ai.txt'], [1], true).length, 1)
  assert.equal(pickFiles(['Arabic.srt'], [5], true).length, 1)
  // two resolutions of one movie
  assert.equal(pickFiles(['[Tsubas] Jin-Rou [1080p][BD].ass', '[Tsubas] Jin-Rou [2160p][BD].ass'], [1], true).length, 2)
  assert.equal(pickFiles(['Arabic.srt', 'Other.srt'], [5], true).length, 2)
  // a number in the name of a lone file does not overrule the page: series-wide numbers are common
  assert.equal(pickFiles(['[ESPADAS] Bleach Sennen Kessen-hen - 46.ass', 'Arial.ttf'], [6], true).length, 1)
  // but several files that all name other episodes are not for this one
  assert.deepEqual(pickFiles(['Show - 05.ass', 'Show - 06.ass'], [1], true), [])
})

test('a zip that numbers its files its own way is read by position when the counts agree', () => {
  // the real part 2 zip: 39 to 50 for the twelve episodes the page lists as 1 to 12, season tags 14 to 25 besides
  const names = Array.from({ length: 12 }, (_, i) => `[Rhythm] Re Zero - ${39 + i} [S2-${14 + i}].ass`)
  assert.deepEqual(pickFiles(names, [1, undefined], false, [1, 12]).map(f => f.episodes), [[39, 39]])
  assert.deepEqual(pickFiles(names, [12, undefined], false, [1, 12]).map(f => f.episodes), [[50, 50]])
  // a heavy batch with one tag and the series-wide numbers 27 to 40
  const bleach = Array.from({ length: 14 }, (_, i) => `[Rocks-Team] Bleach - ${27 + i}${i === 11 ? ' [S3-12] [1080p]' : ' '}.ass`)
  assert.deepEqual(pickFiles(bleach, [12, undefined], false, [1, 14]).map(f => f.episodes), [[38, 38]])
})

test('reading by position needs everything to agree', () => {
  const names = Array.from({ length: 12 }, (_, i) => `[G] Show - ${39 + i}.ass`)
  // no span from the page
  assert.deepEqual(pickFiles(names, [1, undefined], false), [])
  // the page says 13 episodes, there are 12 files
  assert.deepEqual(pickFiles(names, [1, undefined], false, [1, 13]), [])
  // one file number falls inside the page's range, so the zip does use the page's numbering
  const mixedUp = [...names.slice(0, 11), '[G] Show - 07.ass']
  assert.deepEqual(pickFiles(mixedUp, [1, undefined], false, [1, 12]), [])
  // an episode outside the range
  assert.deepEqual(pickFiles(names, [13, undefined], false, [1, 12]), [])
})

test('a zip inside the zip with an episode in its name is a candidate, a fonts zip is not', () => {
  assert.equal(describe('Boruto - 001 [BD][Crunchyroll & Zero-Kon & Almighty].zip')?.format, 'zip')
  assert.equal(describe('Boruto - 001 [BD][Crunchyroll & Zero-Kon & Almighty].zip')?.group, 'Crunchyroll & Zero-Kon & Almighty')
  assert.equal(describe('Fonts.zip'), undefined)
  assert.equal(describe('Show Fonts 01-12.zip'), undefined)
  assert.deepEqual(pickFiles(['Boruto - 001 [A].zip', 'Boruto - 002 [A].zip', 'www.Mirai.ai.txt'], [2, undefined], false).map(f => f.path), ['Boruto - 002 [A].zip'])
})

test('one unnumbered file in a bigger zip is a special or a compilation, it covers the whole block', () => {
  for (const episode of [1, 2, 3]) {
    assert.equal(pickFiles(['[Miyuki] Sailor Moon SuperS Special [DVD-SMC].ass', 'Mirai.ai.txt'], [episode], false).length, 1)
  }
  for (const episode of [1, 2]) {
    assert.equal(pickFiles(["[Kalaacom] Ayane's High Kick - Round 1 and 2.ass", 'Mirai.ai.txt'], [episode], false).length, 1)
  }
  assert.equal(pickFiles(['Arabic.srt', 'Other.srt'], [5], false).length, 0)
})

test('the same episode from two streaming services is two files', () => {
  const names = ['[Shahid] Bleach - 41 (407) [AMZN][VARYG].ass', '[Shahid] Bleach - 41 (407) [DSNP][VARYG].ass', 'Mirai Anime.txt']
  assert.equal(pickFiles(names, [1, undefined], true, [1, 1]).length, 2)
})

test('nothing matching gives nothing', () => {
  assert.deepEqual(pickFiles(['Show - 01.ass'], [5], false), [])
  assert.deepEqual(pickFiles([], [5], true), [])
  assert.deepEqual(pickFiles(['Show - 01.ass', 'Show - 02.ass'], [5], true), [])
})
