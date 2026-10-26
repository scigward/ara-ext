import assert from 'node:assert/strict'
import { test } from 'node:test'

import { noClock } from '../../src/lib/clock.ts'
import { readPicked, unpack } from '../../src/lib/files.ts'
import { pickFiles } from '../../src/lib/names.ts'
import { zipFromBytes } from '../../src/lib/zip.ts'

import { buildZip } from '../helpers/zipbuilder.ts'

const ASS = '[Script Info]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,hello'
const SRT = '1\n00:00:01,000 --> 00:00:02,000\nhello\n'

async function read (items: Parameters<typeof buildZip>[0], episode = 1) {
  const zip = await zipFromBytes(buildZip(items))
  const picked = pickFiles(zip.entries.map(entry => entry.name), [episode], false)
  return (await Promise.all(picked.map(file => readPicked(zip, file, noClock)))).flat()
}

test('a subtitle file is read for what its text says', async () => {
  const [got] = await read([{ name: 'Show - 01.ass', data: ASS }])
  assert.deepEqual([got!.format, got!.text], ['ass', ASS])
})

test('a txt that is really an srt comes out as an srt', async () => {
  const got = await read([{ name: 'Show - 01.txt', data: SRT }])
  assert.deepEqual(got.map(one => one.format), ['srt'])
})

test('a file that is not a subtitle comes out as nothing', async () => {
  assert.deepEqual(await read([{ name: 'Show - 01.txt', data: 'just some credits' }]), [])
})

test('a zip inside the zip is opened for the episode in its name, with the outer file as the owner', async () => {
  const inner = buildZip([{ name: 'Show - 01.ass', data: ASS }, { name: 'Mirai.ai.txt', data: 'credits' }])
  const got = await read([{ name: 'Show [Group] - 01.zip', data: inner, method: 0 }])
  assert.equal(got.length, 1)
  assert.equal(got[0]!.text, ASS)
  assert.equal(got[0]!.file.group, 'Group')
})

test('only one level down is opened', async () => {
  const deep = buildZip([{ name: 'Show - 01.zip', data: buildZip([{ name: 'Show - 01.ass', data: ASS }]), method: 0 }])
  assert.deepEqual(await read([{ name: 'Show - 01.zip', data: deep, method: 0 }]), [])
})

test('a pack only gives a file with the episode in its name', async () => {
  const texts = async (bytes: Uint8Array, lone: boolean) => (await unpack(bytes, [5], lone, noClock)).map(one => one.text)
  assert.deepEqual(await texts(buildZip([4, 5].map(n => ({ name: `Show - 0${n}.srt`, data: `${SRT}${n}` }))), false), [`${SRT}5`])
  const unnumbered = buildZip([{ name: 'Show - Memory Snow.ass', data: ASS }])
  assert.deepEqual(await texts(unnumbered, false), [])
  assert.deepEqual(await texts(unnumbered, true), [ASS])
  assert.deepEqual(await texts(new TextEncoder().encode(SRT), false), [])
})
