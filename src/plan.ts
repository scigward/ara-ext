import { covers } from './listing.ts'

import type { Block } from './listing.ts'
import type { Options, SubtitleQuery } from './types.ts'

export interface Step {
  block: Block
  // what hayase means, then the series-wide number as a fallback
  episodes: [number, number | undefined]
  // this zip is for this one episode only
  lone: boolean
  // the range the page lists, if it lists one
  span?: [number, number]
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
    steps = blocks.filter(block => covers(block, episode)).map(block => ({ block, episodes, lone: lone(block), span: block.episodes.length === 1 ? block.episodes[0] : undefined }))
    if (steps.length) break
  }

  // movies and one offs often say "ova" or nothing where the episode number goes
  if (!steps.length && (query.episodeCount === 1 || query.media?.format === 'MOVIE')) {
    steps = blocks.filter(block => !block.episodes.length).map(block => ({ block, episodes, lone: true }))
  }

  // page order, plus two spares in case a zip is gone or has nothing
  return steps.slice(0, maxFiles(options) + 2)
}
