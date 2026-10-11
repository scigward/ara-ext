import { covers } from './listing.ts'

import type { Block } from './listing.ts'
import type { Options, SubtitleQuery } from './types.ts'

export interface Step {
  block: Block
  // the episode hayase means, then the series-wide number as a fallback
  episodes: [number, number | undefined]
  // the zip is only for this one episode, so a single subtitle in it is the one whatever it's called
  lone: boolean
}

export function maxFiles (options: Options): number {
  return Math.min(8, Math.max(1, Math.round(Number(options.maxFiles) || 3)))
}

// which zips are worth opening for this episode, best first
export function plan (blocks: Block[], query: SubtitleQuery, options: Options): Step[] {
  const absolute = query.absoluteEpisodeNumber
  const episodes: Step['episodes'] = [query.episode, typeof absolute === 'number' && absolute >= 0 && absolute !== query.episode ? absolute : undefined]

  const lone = (block: Block) => block.episodes.length === 1 && block.episodes[0]![0] === block.episodes[0]![1]

  let steps: Step[] = []
  for (const episode of episodes) {
    if (episode === undefined) continue
    steps = blocks.filter(block => covers(block, episode)).map(block => ({ block, episodes, lone: lone(block) }))
    if (steps.length) break
  }

  // a movie or a one off often says "OVA" or nothing at all where the episode number goes
  if (!steps.length && (query.episodeCount === 1 || query.media?.format === 'MOVIE')) {
    steps = blocks.filter(block => !block.episodes.length).map(block => ({ block, episodes, lone: true }))
  }

  const prefer = String(options.translators ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const rank = ({ block }: Step) => {
    const at = prefer.findIndex(name => block.translators.some(t => t.toLowerCase().includes(name)))
    return at < 0 ? prefer.length : at
  }

  // sort is stable, so equal ranks keep the order of the page
  // two spare in case a zip turns out to be gone or has nothing for us
  return steps.sort((a, b) => rank(a) - rank(b)).slice(0, maxFiles(options) + 2)
}
