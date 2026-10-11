import type { Block } from './listing.ts'
import type { Picked } from './names.ts'
import type { Format } from './subtitle.ts'

// hayase uses this string as a file name, and reads the type from what follows the last dot,
// so it has to end in the extension. what's before it is what the track is called in the player
export function label (file: Picked, block: Block, format: Format, extra = ''): string {
  const credited = block.translators.join(' & ')
  // in a zip with several groups the file name knows who did this one, the page only lists them all
  const who = (file.mixed ? file.group ?? credited : credited || file.group) || 'Mirai'
  const release = block.release ? ` (${block.release})` : ''

  const name = `Arabic - ${who.slice(0, 50)}${release}${extra ? ` ${extra}` : ''}`
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${name}.${format}`
}

// "Arabic - Rhythm (BD).ass" twice becomes "... 2.ass" for the second
export function unique (names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map(name => {
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    const dot = name.lastIndexOf('.')
    return n === 1 ? name : `${name.slice(0, dot)} ${n}${name.slice(dot)}`
  })
}
