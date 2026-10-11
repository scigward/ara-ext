import type { Block } from './listing.ts'
import type { Picked } from './names.ts'
import type { Format } from './subtitle.ts'

// hayase treats this as a file name and takes the type after the last dot, so it ends in the extension.
// the rest is the track's name in the player
export function label (file: Picked, block: Block, format: Format, extra = ''): string {
  const credited = block.translators.join(' & ')
  // in a mixed zip the file name knows who made this one, the page just lists everyone
  const who = (file.mixed ? file.group ?? credited : credited || file.group) || 'Mirai'
  const release = block.release ? ` (${block.release})` : ''

  const name = `Arabic - ${who.slice(0, 50)}${release}${extra ? ` ${extra}` : ''}`
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${name}.${format}`
}

// same label twice gets a 2 on the second one
export function unique (names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(name => {
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    const dot = name.lastIndexOf('.')
    return n === 1 ? name : `${name.slice(0, dot)} ${n}${name.slice(dot)}`
  })
}
