import { deflateSync } from 'fflate'

import { crc32 } from '../../src/zip.ts'

export interface Item {
  name: string | Uint8Array
  data: string | Uint8Array
  method?: 0 | 8
  flags?: number
  // pad the local header with more extra bytes than the directory has, real tools do that
  localExtra?: number
  // pretend the stored crc is something else
  crc?: number
  // pretend the file weighs this much, in the headers only
  claimSize?: number
}

const enc = new TextEncoder()
const bytes = (v: string | Uint8Array) => typeof v === 'string' ? enc.encode(v) : v

function put (parts: number[], value: number, size: 2 | 4) {
  for (let i = 0; i < size; i++) parts.push((value >>> (8 * i)) & 0xff)
}

export function buildZip (items: Item[], comment = ''): Uint8Array {
  const out: number[] = []
  const directory: number[] = []

  for (const item of items) {
    const name = bytes(item.name)
    const data = bytes(item.data)
    const method = item.method ?? 8
    const packed = method === 8 ? deflateSync(data) : data
    const crc = item.crc ?? crc32(data)
    const packedSize = item.claimSize ?? packed.length
    const fullSize = item.claimSize ?? data.length
    const flags = item.flags ?? 0
    const offset = out.length
    const extra = item.localExtra ?? 0

    put(out, 0x04034b50, 4); put(out, 20, 2); put(out, flags, 2); put(out, method, 2)
    put(out, 0, 2); put(out, 0x21, 2); put(out, crc, 4); put(out, packedSize, 4); put(out, fullSize, 4)
    put(out, name.length, 2); put(out, extra, 2)
    out.push(...name, ...new Array<number>(extra).fill(0))
    for (let i = 0; i < packed.length; i += 0x4000) out.push(...packed.subarray(i, i + 0x4000))

    put(directory, 0x02014b50, 4); put(directory, 20, 2); put(directory, 20, 2); put(directory, flags, 2); put(directory, method, 2)
    put(directory, 0, 2); put(directory, 0x21, 2); put(directory, crc, 4); put(directory, packedSize, 4); put(directory, fullSize, 4)
    put(directory, name.length, 2); put(directory, 0, 2); put(directory, 0, 2); put(directory, 0, 2); put(directory, 0, 2)
    put(directory, 0, 4); put(directory, offset, 4)
    directory.push(...name)
  }

  const dirOffset = out.length
  out.push(...directory)
  const tail = enc.encode(comment)
  put(out, 0x06054b50, 4); put(out, 0, 2); put(out, 0, 2); put(out, items.length, 2); put(out, items.length, 2)
  put(out, directory.length, 4); put(out, dirOffset, 4); put(out, tail.length, 2)
  out.push(...tail)

  return Uint8Array.from(out)
}
