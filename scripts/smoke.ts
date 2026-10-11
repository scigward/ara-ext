// live check against the real site, it is not part of ci
// npm run smoke -- <myanimelist id> <episode> [series-wide episode] [title ...]
import { mkdirSync, writeFileSync } from 'node:fs'

import { createExtension } from '../src/extension.ts'
import { iosLike } from '../test/helpers/server.ts'

const [mal, episode, absolute] = process.argv.slice(2, 5).map(Number)
const titles = process.argv.slice(5)
if (!mal || !episode) {
  console.error('usage: npm run smoke -- <myanimelist id> <episode> [series-wide episode] [title ...]')
  process.exit(1)
}

const started = Date.now()
// the ios wrapper hides what the ios proxy hides, so a slip shows up here and not on a phone
const results = await createExtension().single({
  anilistId: 0,
  malId: mal,
  episode,
  absoluteEpisodeNumber: absolute,
  titles,
  fetch: iosLike(fetch)
})
console.log(`${results.length} file(s) in ${Date.now() - started} ms`)

mkdirSync('local/smoke', { recursive: true })
for (const { url, language } of results) {
  const text = await (await fetch(url)).text()
  const dialogue = text.split(/\r?\n/).filter(line => /^Dialogue:/.test(line) || /-->/.test(line))
  console.log(`\n${language}  (${Math.round(text.length / 1024)} KB, ${dialogue.length} lines)`)
  console.log('  ' + (dialogue[Math.floor(dialogue.length / 2)] ?? '(no lines?)'))
  writeFileSync(`local/smoke/${language}`, text)
}
