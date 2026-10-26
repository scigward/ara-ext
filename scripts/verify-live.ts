// npm run verify-live [origin]
// waits for a fresh deploy to show up, then checks it. ci runs this right after every deploy
import { readFileSync } from 'node:fs'

import { liveProblems } from './live.ts'

const origin = process.argv[2] ?? 'https://ext-ara.pages.dev'
const read = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8')
const names = ['index.json', ...(JSON.parse(read('index.json')) as Array<{ code: string }>).map(entry => entry.code.slice(entry.code.lastIndexOf('/') + 1))]
const expected = Object.fromEntries(names.map(name => [name, read(name)]))

// a deploy takes a moment to reach the edge, so a few misses are no reason to panic
const TRIES = 10
for (let attempt = 1; ; attempt++) {
  const problems = await liveProblems(origin, expected).catch((error: unknown) => [`could not reach ${origin}: ${String(error)}`])
  if (!problems.length) {
    console.log(`${origin} is live and as it should be`)
    break
  }
  if (attempt === TRIES) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  await new Promise(resolve => setTimeout(resolve, 3000))
}
