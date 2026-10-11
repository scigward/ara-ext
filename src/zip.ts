import { inflateSync } from 'fflate'

import { request } from './http.ts'

import type { Clock } from './clock.ts'

export interface ZipEntry {
  name: string
  nameLength: number
  method: number
  flags: number
  crc: number
  packed: number
  size: number
  offset: number
}

export interface Zip {
  entries: ZipEntry[]
  // takes the clock of the call that reads, a zip stays cached longer than any one call
  read: (entry: ZipEntry, clock: Clock) => Promise<Uint8Array>
}

const TAIL = 64 * 1024
// a local header can carry a longer extra field than the directory one, leave room for that
const SLACK = 512
// subtitle files are well below these, the caps are there for broken or hostile zips
const MAX_ENTRY = 16 * 1024 * 1024
const MAX_DIRECTORY = 4 * 1024 * 1024

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32 (bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8)
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0

function decodeName (raw: Uint8Array): string {
  let name: string
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch {
    // old tools write the local codepage, arabic windows zips are mostly cp1256
    name = new TextDecoder('windows-1256').decode(raw)
  }
  // some tools write backslashes as separators
  return name.replaceAll('\\', '/')
}

function findEnd (buf: Uint8Array): number {
  const lowest = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (u32(buf, i) === 0x06054b50 && i + 22 + u16(buf, i + 20) <= buf.length) return i
  }
  throw new Error('that file is not a zip')
}

function parseDirectory (dir: Uint8Array, count: number): ZipEntry[] {
  const entries: ZipEntry[] = []
  let p = 0
  for (let i = 0; i < count && p + 46 <= dir.length; i++) {
    if (u32(dir, p) !== 0x02014b50) break
    const packed = u32(dir, p + 20)
    const size = u32(dir, p + 24)
    const offset = u32(dir, p + 42)
    if (packed === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw new Error('zip64 files are not supported')

    const nameLength = u16(dir, p + 28)
    entries.push({
      name: decodeName(dir.subarray(p + 46, p + 46 + nameLength)),
      nameLength,
      method: u16(dir, p + 10),
      flags: u16(dir, p + 8),
      crc: u32(dir, p + 16),
      packed,
      size,
      offset
    })
    p += 46 + nameLength + u16(dir, p + 30) + u16(dir, p + 32)
  }
  return entries
}

// reads the end of the file first, that is enough to list everything, and entries are then
// pulled one by one with range requests, so a 20mb batch zip costs about what one episode weighs
export async function openZip (fetchFn: typeof fetch, url: string, clock: Clock, tailSize = TAIL): Promise<Zip> {
  const res = await request(fetchFn, url, clock, { Range: `bytes=-${tailSize}` })
  const tail = new Uint8Array(await clock.run(res.arrayBuffer()))
  // a server that skips ranges sends the whole file, which works too
  const whole = res.status !== 206

  const end = findEnd(tail)
  const count = u16(tail, end + 10)
  const dirSize = u32(tail, end + 12)
  const dirOffset = u32(tail, end + 16)
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) throw new Error('zip64 files are not supported')
  if (dirSize > MAX_DIRECTORY) throw new Error('that zip has a silly amount of files')

  // where tail[0] sits in the real file, the directory ends right where the end record starts
  const base = whole ? 0 : dirOffset + dirSize - end

  // the tail always ends at the end of the file, so anything starting inside it is covered
  const grab = async (start: number, length: number, clock: Clock): Promise<Uint8Array> => {
    if (start >= base) return tail.subarray(start - base, start - base + length)
    const got = await request(fetchFn, url, clock, { Range: `bytes=${start}-${start + length - 1}` })
    const body = new Uint8Array(await clock.run(got.arrayBuffer()))
    return got.status === 206 ? body : body.subarray(start, start + length)
  }

  const entries = parseDirectory(await grab(dirOffset, dirSize, clock), count)

  return {
    entries,
    async read (entry, clock) {
      if (entry.flags & 1) throw new Error(`${entry.name} is encrypted`)
      if (entry.size > MAX_ENTRY || entry.packed > MAX_ENTRY) throw new Error(`${entry.name} is too big`)

      let buf = await grab(entry.offset, 30 + entry.nameLength + SLACK + entry.packed, clock)
      if (buf.length < 30 || u32(buf, 0) !== 0x04034b50) throw new Error(`${entry.name} has a broken header`)
      const dataStart = 30 + u16(buf, 26) + u16(buf, 28)
      if (buf.length < dataStart + entry.packed) buf = await grab(entry.offset, dataStart + entry.packed, clock)
      if (buf.length < dataStart + entry.packed) throw new Error(`${entry.name} is cut short`)

      const packed = buf.subarray(dataStart, dataStart + entry.packed)
      let data: Uint8Array
      if (entry.method === 0) data = packed
      else if (entry.method === 8) data = inflateSync(packed, { out: new Uint8Array(entry.size) })
      else throw new Error(`${entry.name} uses a zip method we can't open`)

      if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error(`${entry.name} is damaged`)
      return data
    }
  }
}
