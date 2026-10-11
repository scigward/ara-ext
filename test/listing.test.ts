import assert from 'node:assert/strict'
import { test } from 'node:test'

import { covers, decodeEntities, parseListing, parseSize } from '../src/listing.ts'

import { badge, block, page, UPLOADS } from './helpers/pages.ts'

test('a single episode block is read in full', () => {
  const [one] = parseListing(page(block()))
  assert.deepEqual(one, { episodes: [[1, 1]], release: 'WEB', translators: ['Cr'], zip: `${UPLOADS}/Cr-Show-01.zip`, size: 13681 })
})

test('a range written with "to" is one inclusive range', () => {
  const [one] = parseListing(page(block({ episodes: `${badge('001')} إلى ${badge('201')} <i class="fa-duotone fa-check-double"></i>` })))
  assert.deepEqual(one!.episodes, [[1, 201]])
})

test('arabic-indic digits count too', () => {
  const [one] = parseListing(page(block({ episodes: `${badge('٠٣')} إلى ${badge('١٢')}` })))
  assert.deepEqual(one!.episodes, [[3, 12]])
})

test('separate badges without "to" are separate episodes', () => {
  const [one] = parseListing(page(block({ episodes: `${badge('01')}${badge('03')}` })))
  assert.deepEqual(one!.episodes, [[1, 1], [3, 3]])
})

test('a badge that is not a number leaves the episodes unknown', () => {
  const [one] = parseListing(page(block({ episodes: badge('OVA') })))
  assert.deepEqual(one!.episodes, [])
})

test('the fonts link on the other host and rar mirrors are ignored', () => {
  const links = [
    `${UPLOADS}/Rhythm-Show-S2.zip`,
    'https://miraianime.app/?file=Fansub/Animes%20Subtitles%20Fonts/Rhythm-Show-Fonts.zip&amp;token=abc:123:U',
    'https://top4top.io/downloadf-3292wwbzf1-rar.html'
  ]
  const result = parseListing(page(block({ links })))
  assert.equal(result.length, 1)
  assert.equal(result[0]!.zip, `${UPLOADS}/Rhythm-Show-S2.zip`)
})

test('a block whose only link is not a zip on the site is dropped', () => {
  const links = ['https://top4top.io/downloadf-3292wwbzf1-rar.html', `${UPLOADS}/pack.rar`, 'https://evil.example/wp-content/uploads/a.zip']
  assert.deepEqual(parseListing(page(block({ links }))), [])
})

test('a file the page says is gone is dropped', () => {
  assert.deepEqual(parseListing(page(block({ size: 'الملف غير موجود' }))), [])
})

test('several translators, a combined release and entities in names', () => {
  const [one] = parseListing(page(block({ translators: ['Assassin&#039;S Sub', 'A &amp; B'], release: 'WEB' })))
  assert.deepEqual(one!.translators, ["Assassin'S Sub", 'A & B'])

  const both = block().replace('<span style="background: hotpink;"> WEB </span>', '<span> WEB </span><span> BD </span>')
  assert.equal(parseListing(page(both))[0]!.release, 'WEB/BD')
})

test('hrefs with spaces and entities in the zip name survive', () => {
  const [one] = parseListing(page(block({ links: [`${UPLOADS}/A&amp;B Show 01.zip`] })))
  assert.equal(new URL(one!.zip).pathname.endsWith('A&B%20Show%2001.zip'), true)
})

test('blocks keep the page order and the page chrome around them is ignored', () => {
  const result = parseListing(page(block({ links: [`${UPLOADS}/a.zip`] }), block({ links: [`${UPLOADS}/b.zip`] }), block({ links: [`${UPLOADS}/c.zip`] })))
  assert.deepEqual(result.map(b => b.zip.split('/').pop()), ['a.zip', 'b.zip', 'c.zip'])
})

test('a page with no blocks gives nothing', () => {
  assert.deepEqual(parseListing('<html>nothing here</html>'), [])
  assert.deepEqual(parseListing(''), [])
})

test('covers asks the ranges', () => {
  const [one] = parseListing(page(block({ episodes: `${badge('05')} إلى ${badge('08')}` })))
  assert.equal(covers(one!, 4), false)
  assert.equal(covers(one!, 5), true)
  assert.equal(covers(one!, 8), true)
  assert.equal(covers(one!, 9), false)
})

test('entities decode, junk codes are left alone', () => {
  assert.equal(decodeEntities('&amp; &lt; &#8217; &#x27; &nbsp;|&#99999999;|&bogus;'), "& < ’ '  |&#99999999;|&bogus;")
})

test('sizes in arabic units, roughly in bytes', () => {
  assert.equal(parseSize('13.36 كيلوبايت'), 13681)
  assert.equal(parseSize('4.58 ميجابايت'), 4802478)
  assert.equal(parseSize('1.2 جيجابايت'), 1288490189)
  assert.equal(parseSize('512 بايت'), 512)
  assert.equal(parseSize('٤.٥ ميجابايت'), 4718592)
  assert.equal(parseSize('الملف غير موجود'), undefined)
  assert.equal(parseSize(''), undefined)
  assert.equal(parseSize('12 parsecs'), undefined)
})

test('the size comes along with the block', () => {
  assert.equal(parseListing(page(block({ size: '4.58 ميجابايت' })))[0]!.size, 4802478)
  assert.equal(parseListing(page(block({ size: 'unknown' })))[0]!.size, undefined)
})
