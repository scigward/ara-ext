// what a deploy has to get right, checked against the real site.
// kept apart from the cli so the tests can hand it a fake fetch

export interface Expected {
  version: string
  // the built file, byte for byte
  bundle: string
}

// none of these may exist. pages says 200 to unknown paths unless there is a 404.html
const GONE = ['/src/index.ts', '/mirai.js.map', '/package.json', '/.git/config', '/test/', '/nothing-here']

export async function liveProblems (origin: string, expected: Expected, fetchFn: typeof fetch = fetch): Promise<string[]> {
  const problems: string[] = []

  // exactly one star: two of them joined by a comma is not valid cors
  const cors = (name: string, res: Response) => {
    if (res.headers.get('access-control-allow-origin') !== '*') problems.push(`${name} has no clean cors header`)
  }

  const manifest = await fetchFn(`${origin}/index.json`)
  cors('index.json', manifest)
  if (manifest.headers.get('x-content-type-options') !== 'nosniff') problems.push('index.json is missing nosniff')
  if (!manifest.ok) {
    problems.push(`index.json answered ${manifest.status}`)
  } else {
    const [entry] = await manifest.json().catch(() => []) as Array<Record<string, unknown>>
    if (entry?.version !== expected.version) problems.push(`index.json says ${String(entry?.version)}, wanted ${expected.version}`)
    if (entry?.update !== `${origin}/index.json`) problems.push('index.json points its update link somewhere else')
    if (entry?.code !== `${origin}/mirai.js`) problems.push('index.json points its code link somewhere else')
  }

  const bundle = await fetchFn(`${origin}/mirai.js`)
  cors('mirai.js', bundle)
  if (!bundle.ok) problems.push(`mirai.js answered ${bundle.status}`)
  else if (await bundle.text() !== expected.bundle) problems.push('mirai.js is not the file that was built')

  for (const path of GONE) {
    const res = await fetchFn(`${origin}${path}`)
    if (res.status !== 404) problems.push(`${path} answered ${res.status}, it must be 404`)
  }
  return problems
}
