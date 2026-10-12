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
