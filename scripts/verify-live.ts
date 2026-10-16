// npm run verify-live [origin]
// waits for a fresh deploy to show up, then checks it. ci runs this right after every deploy
import { readFileSync } from 'node:fs'

import { liveProblems } from './live.ts'

const origin = process.argv[2] ?? 'https://mirai-ext.pages.dev'
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const expected = {
  version: (JSON.parse(read('../index.json')) as Array<{ version: string }>)[0]!.version,
  bundle: read('../public/mirai.js')
}

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
