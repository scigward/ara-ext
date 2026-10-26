import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkFile } from '../scripts/reliability/check.ts'

const at = { numbers: [5, 29], duration: 24, movie: false, fonts: false }
const srt = (lines: number, said = 'مرحبا بكم جميعا', every = 40) => Array.from({ length: lines }, (_, i) => {
  const time = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`
  return `${i + 1}\n${time(i * every)} --> ${time(i * every + 2)}\n${said}\n`
}).join('\n')

test('a normal arabic episode has nothing to say against it', () => {
  const got = checkFile('Arabic - Group (Show - 05).srt', srt(35), at)
  assert.deepEqual(got.warnings, [])
  assert.equal(got.lines, 35)
  assert.equal(got.arabic, 1)
  assert.equal(got.end, 34 * 40 + 2)
})

test('english, signs only, the wrong length and the wrong episode are told', () => {
  assert.deepEqual(checkFile('Arabic - Group (Show - 05).srt', srt(35, 'hello there'), at).warnings, ['only 0% arabic'])
  assert.deepEqual(checkFile('Arabic - Group (Show - 05).srt', srt(8, 'مرحبا', 120), at).warnings, ['only 8 lines'])
  assert.deepEqual(checkFile('Arabic - Group (Show - 05).srt', srt(35, 'مرحبا', 6), at).warnings, ['ends at 3 min, the episode is about 24'])
  assert.deepEqual(checkFile('Arabic - Group (Show - 06).srt', srt(35), at).warnings, ['name says episode 6'])
  assert.deepEqual(checkFile('Arabic - Group (Show 01-25).srt', srt(35), at).warnings, [], 'a pack name says nothing about one episode')
  assert.deepEqual(checkFile('Arabic - Group (Show S04E29).srt', srt(35), at).warnings, [], 'the tv databases number it their own way')
})

test('an ass is read for its dialogue, and a font is looked for when it should be there', () => {
  const ass = ['[Script Info]', '[Events]', ...Array.from({ length: 40 }, (_, i) => `Dialogue: 0,0:${String(i).padStart(2, '0')}:00.00,0:${String(i).padStart(2, '0')}:02.50,Default,,0,0,0,,{\\an8}مرحبا\\Nبكم`)].join('\n')
  const got = checkFile('Arabic - Group (Show - 05).ass', ass, { ...at, fonts: true })
  assert.equal(got.lines, 40)
  assert.equal(got.end, 39 * 60 + 2.5)
  assert.deepEqual(got.warnings, ['no font inside'])
  assert.deepEqual(checkFile('Arabic - Group (Show - 05).ass', ass.replace('[Events]', '[Fonts]\nfontname: Own.ttf\n[Events]'), { ...at, fonts: true }).warnings, [])
})
