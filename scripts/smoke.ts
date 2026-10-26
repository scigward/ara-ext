// live check against the real sites, it is not part of ci
// npm run smoke -- <extension> <anilist id> <episode> [api key]
import { mkdirSync, writeFileSync } from 'node:fs'

import { iosLike } from '../test/helpers/server.ts'

import type { Options, SubtitleQuery, SubtitleResult } from '../src/lib/types.ts'

interface Mapped {
  mappings?: { mal_id?: number, imdb_id?: string }
  titles?: Record<string, string>
  episodes?: Record<string, { absoluteEpisodeNumber?: number }>
}

const [name = '', anilist = '', episode = '', key] = process.argv.slice(2)
if (!name || !Number(anilist) || !Number(episode)) {
  console.error('usage: npm run smoke -- <extension> <anilist id> <episode> [api key]')
  process.exit(1)
}

const { default: extension } = await import(`../src/${name}/index.ts`) as { default: { single: (query: SubtitleQuery, options: Options) => Promise<SubtitleResult[]> } }
// the ids and titles hayase would send, from where hayase gets them
const { mappings, titles, episodes } = await (await fetch(`https://api.ani.zip/mappings?anilist_id=${anilist}`)).json() as Mapped

const started = Date.now()
// the ios wrapper hides what the ios proxy hides, so a slip shows up here and not on a phone
const results = await extension.single({
  anilistId: Number(anilist),
  malId: mappings?.mal_id,
  imdbId: mappings?.imdb_id,
  episode: Number(episode),
  absoluteEpisodeNumber: episodes?.[episode]?.absoluteEpisodeNumber,
  titles: [titles?.['x-jat'], titles?.en, titles?.ja].filter((title): title is string => !!title),
  fetch: iosLike(fetch)
}, { [`${name}Key`]: key })
console.log(`${results.length} file(s) in ${Date.now() - started} ms`)

mkdirSync('local/smoke', { recursive: true })
for (const { url, language } of results) {
  const text = await (await fetch(url)).text()
  const dialogue = text.split(/\r?\n/).filter(line => /^Dialogue:/.test(line) || /-->/.test(line))
  console.log(`\n${language}  (${Math.round(text.length / 1024)} KB, ${dialogue.length} lines)`)
  console.log('  ' + (dialogue[Math.floor(dialogue.length / 2)] ?? '(no lines?)'))
  writeFileSync(`local/smoke/${language}`, text)
}
