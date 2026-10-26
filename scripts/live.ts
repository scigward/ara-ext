// what a deploy has to get right, checked against the real site.
// kept apart from the cli so the tests can hand it a fake fetch

// none of these may exist. pages says 200 to unknown paths unless there is a 404.html
const GONE = ['/src/index.ts', '/mirai.js.map', '/package.json', '/.git/config', '/test/', '/nothing-here']

// files: what was built, byte for byte, by name
export async function liveProblems (origin: string, files: Record<string, string>, fetchFn: typeof fetch = fetch): Promise<string[]> {
  const problems: string[] = []

  for (const [name, built] of Object.entries(files)) {
    const res = await fetchFn(`${origin}/${name}`)
    // exactly one star: two of them joined by a comma is not valid cors
    if (res.headers.get('access-control-allow-origin') !== '*') problems.push(`${name} has no clean cors header`)
    if (res.headers.get('x-content-type-options') !== 'nosniff') problems.push(`${name} is missing nosniff`)
    if (!res.ok) problems.push(`${name} answered ${res.status}`)
    else if (await res.text() !== built) problems.push(`${name} is not the file that was built`)
  }

  for (const path of GONE) {
    const res = await fetchFn(`${origin}${path}`)
    if (res.status !== 404) problems.push(`${path} answered ${res.status}, it must be 404`)
  }
  return problems
}
