import { noClock } from './clock.ts'
import { pickFiles } from './names.ts'
import { decodeText, detectFormat } from './subtitle.ts'
import { zipFromBytes } from './zip.ts'

import type { Clock } from './clock.ts'
import type { Picked } from './names.ts'
import type { Format } from './subtitle.ts'
import type { Zip } from './zip.ts'

export interface Read {
  // the file in the outer zip, it has the group and tags
  file: Picked
  text: string
  format: Format
}

const entryOf = (zip: Zip, path: string) => zip.entries.find(e => e.name === path)!

// the text decides the format, junk comes out as nothing
function fromBytes (bytes: Uint8Array, file: Picked): Read[] {
  const text = decodeText(bytes)
  const format = detectFormat(text)
  return format ? [{ file, text, format }] : []
}

export async function readPicked (zip: Zip, file: Picked, clock: Clock): Promise<Read[]> {
  const bytes = await zip.read(entryOf(zip, file.path), clock)
  if (file.format !== 'zip') return fromBytes(bytes, file)

  // some batches are zips of zips, one per episode: what's inside is for the episode in the name.
  // one level only, it's all in memory already
  const inner = await zipFromBytes(bytes)
  const picks = pickFiles(inner.entries.map(e => e.name), [file.episodes?.[0]], true).filter(p => p.format !== 'zip')
  const reads = await Promise.all(picks.map(async p => fromBytes(await inner.read(entryOf(inner, p.path), noClock), file)))
  return reads.flat()
}

// lone: the download is for this one episode. if not it's a pack, and only a file with the episode's number in its name counts.
// name is the file's own name in the zip, without the type
export async function unpack (bytes: Uint8Array, numbers: Array<number | undefined>, lone: boolean, clock: Clock): Promise<Array<{ text: string, format: Format, name?: string }>> {
  // zips start with PK, anything else is one subtitle file as it is
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    if (!lone) return []
    const text = decodeText(bytes)
    const format = detectFormat(text)
    return format ? [{ text, format }] : []
  }
  const zip = await zipFromBytes(bytes)
  const picked = pickFiles(zip.entries.map(entry => entry.name), numbers, lone).filter(file => lone || file.episodes)
  const reads = await Promise.all(picked.map(file => readPicked(zip, file, clock)))
  return reads.flat().map(({ file, text, format }) => ({ text, format, name: file.path.slice(file.path.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '').trim() }))
}
