import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decodeText, detectFormat, formatOf, toDataUrl, toLink } from '../src/subtitle.ts'

const utf16 = (s: string, bom: number[]) => Uint8Array.from([...bom, ...[...s].flatMap(c => bom[0] === 0xff ? [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8] : [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff])])

test('formats come from the extension, any case', () => {
  assert.equal(formatOf('a/b/Show - 01.ASS'), 'ass')
  assert.equal(formatOf('Show.srt'), 'srt')
  assert.equal(formatOf('Mirai Anime.txt'), undefined)
  assert.equal(formatOf('noextension'), undefined)
})

test('utf-8 comes out clean, bom gone', () => {
  const bytes = new TextEncoder().encode('﻿[Script Info]\nمرحبا')
  assert.equal(decodeText(bytes), '[Script Info]\nمرحبا')
})

test('utf-16 in both orders is read', () => {
  assert.equal(decodeText(utf16('مرحبا', [0xff, 0xfe])), 'مرحبا')
  assert.equal(decodeText(utf16('مرحبا', [0xfe, 0xff])), 'مرحبا')
})

test('old windows-1256 text is read when it is not utf-8', () => {
  // "مرحبا" in cp1256
  assert.equal(decodeText(Uint8Array.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7])), 'مرحبا')
})

test('the text says what it is, whatever the file was called', () => {
  assert.equal(detectFormat('[Script Info]\nTitle: x'), 'ass')
  assert.equal(detectFormat('Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,hi'), 'ass')
  assert.equal(detectFormat('1\n00:00:01,000 --> 00:00:02,500\nhi'), 'srt')
  assert.equal(detectFormat('WEBVTT\n\n00:01.000 --> 00:02.500\nhi'), 'vtt')
  assert.equal(detectFormat('00:01.000 --> 00:02.500\nhi'), 'srt')
  assert.equal(detectFormat('{10}{20}hi'), 'sub')
})

test('credits and other text are not subtitles', () => {
  assert.equal(detectFormat('تم تحميل ملفات الترجمة من موقع ميراي انمي miraianime.net\n\nhttps://miraianime.net'), undefined)
  assert.equal(detectFormat('just some text'), undefined)
  assert.equal(detectFormat(''), undefined)
})

test('the data url opens through fetch and gives the same text back', async () => {
  const original = '[Script Info]\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,مرحبا بالعالم\r\n'.repeat(5000)
  const url = toDataUrl(original, 'ass')
  assert.match(url, /^data:text\/x-ssa;charset=utf-8;base64,/)
  assert.equal(await (await fetch(url)).text(), original)
})

test('the link is a data url in a page and a blob url in a worker, and both give the text back', async () => {
  const text = '[Script Info]\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,مرحبا\r\n'
  assert.match(toLink(text, 'ass'), /^data:text\/x-ssa/)

  // node has no worker scope, so pretend this is one
  const scope = globalThis as { WorkerGlobalScope?: unknown }
  scope.WorkerGlobalScope = class { static [Symbol.hasInstance] () { return true } }
  try {
    const url = toLink(text, 'ass')
    assert.match(url, /^blob:/)
    assert.equal(await (await fetch(url)).text(), text)
  } finally {
    delete scope.WorkerGlobalScope
  }
})
