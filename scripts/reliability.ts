// how the extensions do on the real sites, over a big list of anime of every format. not part of ci.
// npm run reliability                    wide pass: one episode of every anime in the list, picks up where it stopped
// npm run reliability -- --deep          deep pass: four episodes of a sample of what the wide pass found
// --new  start over instead of continuing      --live  test what ext-ara.pages.dev serves, not the local build
// --refresh  fetch the anime list again        --limit=N  test at most N more
// --budget=subsource:3000,subdl:2000,mirai:3000  requests each site may get from one run of the command
// --top=TV:800,MOVIE:300,OVA:250,ONA:250,SPECIAL:250,TV_SHORT:100,MUSIC:50   --sample=120 (deep)
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

import { noClock } from '../src/lib/clock.ts'
import { episodeOf } from '../src/lib/episode.ts'
import { strict } from '../test/helpers/server.ts'
import { catalog, DIR, prepare, sleep } from './reliability/anime.ts'
import { checkFile } from './reliability/check.ts'
import { report } from './reliability/report.ts'
import { subdlTruth, subsourceTruth } from './reliability/truth.ts'

import type { Options, SubtitleQuery, SubtitleResult } from '../src/lib/types.ts'
import type { Anime, Prepared } from './reliability/anime.ts'
import type { Row, SiteResult, Status } from './reliability/report.ts'
import type { Truth } from './reliability/truth.ts'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const value = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
const pairs = (text: string | undefined, fallback: Record<string, number>) => ({
  ...fallback,
  ...Object.fromEntries((text ?? '').split(',').filter(Boolean).map(pair => [pair.split(':')[0]!, Number(pair.split(':')[1])]))
})

const deep = flag('deep')
const mode = deep ? 'deep' : 'wide'
const top = pairs(value('top'), { TV: 800, MOVIE: 300, OVA: 250, ONA: 250, SPECIAL: 250, TV_SHORT: 100, MUSIC: 50 })
const budget = pairs(value('budget'), { subsource: 3000, subdl: 2000, mirai: 3000 })
const sample = Number(value('sample')) || 120
const limit = Number(value('limit')) || Infinity

interface Extension { single: (query: SubtitleQuery, options: Options) => Promise<SubtitleResult[]> }
const manifest = JSON.parse(readFileSync('index.json', 'utf8')) as Array<{ id: string, version: string, code: string }>
const SITES: Record<string, string> = { miraianime: 'mirai', subdl: 'subdl', subsource: 'subsource' }
const keys: Record<string, string | undefined> = { subdl: process.env.SUBDL_KEY?.trim(), subsource: process.env.SUBSOURCE_KEY?.trim() }

async function load (code: string): Promise<Extension> {
  const text = flag('live') ? await (await fetch(code)).text() : readFileSync(`public/${code.slice(code.lastIndexOf('/') + 1)}`, 'utf8')
  return (await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`) as { default: Extension }).default
}

const extensions = new Map<string, Extension>()
for (const { id, code } of manifest) {
  const site = SITES[id] ?? id
  if ((site === 'subdl' || site === 'subsource') && !keys[site]) {
    console.log(`no ${site.toUpperCase()}_KEY in apikeys.env, ${site} is left out`)
    continue
  }
  extensions.set(site, await load(code))
}

// every request counted per site, never logged: the subdl key rides in its urls
const siteOf = (url: string) => {
  const host = new URL(url).hostname
  return host.endsWith('subsource.net') ? 'subsource' : host.endsWith('subdl.com') ? 'subdl' : host.endsWith('miraianime.net') ? 'mirai' : host
}
const used: Record<string, number> = {}
const recent: Record<string, number[]> = {}
const counted = (async (input: string | URL | Request, init?: RequestInit) => {
  const site = siteOf(input instanceof Request ? input.url : String(input))
  used[site] = (used[site] ?? 0) + 1
  ;(recent[site] ??= []).push(Date.now())
  return await fetch(input, init)
}) as typeof fetch
// a worker's own fetch, called the way hayase hands it over
const workerFetch = strict(counted)

// [requests a minute we allow ourselves, what one call can take]. a test waits before it starts, never in the middle,
// or the extension's own 8 s clock would run out
const PACE: Record<string, [number, number]> = { subsource: [50, 16], subdl: [40, 14], mirai: [40, 14] }
async function room (sites: string[]) {
  for (const site of sites) {
    const [perMinute, call] = PACE[site] ?? [60, 10]
    for (;;) {
      const times = (recent[site] ?? []).filter(time => time > Date.now() - 60_000)
      recent[site] = times
      if (times.length + call <= perMinute) break
      await sleep(times[0]! + 60_000 - Date.now() + 100)
    }
  }
}

const { anime: list, mirai: miraiIds } = await catalog(top, flag('refresh'))
const onMirai = new Set(miraiIds)
const byId = new Map(list.map(anime => [anime.id, anime]))

// mirai is a small site: test it on what it has, and on a few others to see it answer nothing cleanly
const sitesFor = (anime: Anime) => [...extensions.keys()].filter(site => site !== 'mirai' || onMirai.has(anime.id) || anime.id % 20 === 0)

async function runSite (site: string, anime: Anime, prepared: Prepared, episode: number): Promise<SiteResult> {
  const query = prepared.query(episode, workerFetch)
  const key = keys[site]
  const options: Options = { maxFiles: deep ? 3 : 1, ...(site === 'subdl' && { subdlKey: key }), ...(site === 'subsource' && { subsourceKey: key }) }
  const started = Date.now()
  let returned: SubtitleResult[] = []
  let error: string | undefined
  try {
    returned = await extensions.get(site)!.single(query, options)
  } catch (thrown) {
    error = thrown instanceof Error ? thrown.message : String(thrown)
  }
  const ms = Date.now() - started

  // the numbers the extensions match on: anilist's, and the tv databases' from ani.zip
  const mapped = returned.length ? (await episodeOf(query, noClock)).numbers : []
  const numbers = [episode, ...mapped].filter((n): n is number => n !== undefined)
  const files = await Promise.all(returned.map(async ({ url, language }) => {
    const text = await (await fetch(url)).text()
    const at = { numbers, duration: anime.duration ?? undefined, movie: anime.format === 'MOVIE', fonts: true }
    return { name: language, ...checkFile(language, text, at), hash: createHash('sha1').update(text).digest('hex').slice(0, 12) }
  }))

  // the site is only asked when nothing came back, that's when it matters
  let truth: Truth | undefined
  if (!files.length && !error) {
    try {
      if (site === 'mirai') truth = { releases: Number(onMirai.has(anime.id)), fitting: 0 }
      else truth = await (site === 'subdl' ? subdlTruth : subsourceTruth)(prepared.query(episode, workerFetch), key!)
    } catch {}
  }
  const status: Status = ms > 10_000 ? 'slow' : error ? 'error' : files.length ? 'ok' : !truth ? 'unchecked' : truth.fitting ? 'miss' : truth.releases ? 'maybe' : 'none'
  return { site, status, ms, files, ...(error && { error }), ...(truth && { truth }) }
}

// the formats take turns, so a run that stops early still covers every kind
function interleave (anime: Anime[]): Anime[] {
  const groups = new Map<string, Anime[]>()
  for (const one of [...anime].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))) {
    const format = one.format ?? 'UNKNOWN'
    groups.set(format, [...groups.get(format) ?? [], one])
  }
  const queues = [...groups.values()]
  const out: Anime[] = []
  while (queues.some(queue => queue.length)) for (const queue of queues) if (queue.length) out.push(queue.shift()!)
  return out
}

const runs = `${DIR}/runs`
mkdirSync(runs, { recursive: true })
const readRows = (run: string): Row[] => existsSync(`${runs}/${run}/results.jsonl`)
  ? readFileSync(`${runs}/${run}/results.jsonl`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Row)
  : []
const metaOf = (run: string) => JSON.parse(readFileSync(`${runs}/${run}/meta.json`, 'utf8')) as { started: string, finished?: string, build: string, versions: Record<string, string> }
const earlier = readdirSync(runs).filter(run => existsSync(`${runs}/${run}/meta.json`)).sort()
const open = flag('new') ? undefined : earlier.filter(run => run.endsWith(`-${mode}`) && !metaOf(run).finished).at(-1)
const run = open ?? `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${mode}`
const dir = `${runs}/${run}`
mkdirSync(dir, { recursive: true })
const versions = Object.fromEntries(manifest.map(({ id, version }) => [SITES[id] ?? id, version]))
const meta = open ? metaOf(open) : { started: new Date().toISOString(), build: flag('live') ? 'live' : 'local', versions }
if (open && JSON.stringify(meta.versions) !== JSON.stringify(versions)) console.log(`note: this run started with ${JSON.stringify(meta.versions)}, the files now are ${JSON.stringify(versions)}`)
writeFileSync(`${dir}/meta.json`, JSON.stringify(meta, null, 1))

const pick = (anime: Anime, aired: number) => aired <= 1 ? 1 : 1 + (anime.id * 7919) % aired
interface Job { anime: Anime, episodes: (aired: number) => number[] }
let jobs: Job[]
if (deep) {
  // what the last wide pass found something for
  const wide = earlier.filter(r => r.endsWith('-wide')).at(-1)
  const found = new Set((wide ? readRows(wide) : []).filter(row => row.results.some(result => result.status === 'ok')).map(row => row.id))
  jobs = interleave([...found].flatMap(id => byId.get(id) ?? [])).slice(0, sample).map(anime => ({
    anime,
    episodes: aired => [...new Set([1, Math.ceil(aired / 2), Math.ceil(aired / 2) + 1, aired])].filter(n => n <= aired)
  }))
  if (!jobs.length) console.log('the deep pass samples what a wide pass found, run the wide pass first')
} else {
  jobs = interleave(list).map(anime => ({ anime, episodes: aired => [pick(anime, aired)] }))
}

const rows = readRows(run)
const done = new Set(rows.map(row => `${row.id}:${row.episode}`))
let stopping = ''
process.on('SIGINT', () => {
  if (stopping) process.exit(1)
  stopping = 'stopped by hand'
  console.log('\nfinishing this one, then writing the report (ctrl+c again to quit now)')
})
const throttled: Record<string, number> = {}
let tested = 0

// one anime's episodes. sets stopping when the run should end
async function testAnime (position: string, anime: Anime, episodes: Job['episodes']) {
  const prepared = await prepare(anime)
  for (const episode of episodes(prepared.aired)) {
    if (done.has(`${anime.id}:${episode}`)) continue
    if (stopping) return
    if (tested >= limit) {
      stopping = `reached --limit=${limit}`
      return
    }
    const over = Object.keys(budget).find(site => extensions.has(site) && (used[site] ?? 0) >= budget[site]!)
    if (over) {
      stopping = `${over} used its ${budget[over]} requests for this run`
      return
    }
    const sites = sitesFor(anime)
    await room(sites)
    const results = await Promise.all(sites.map(site => runSite(site, anime, prepared, episode)))
    const row: Row = { id: anime.id, title: anime.title.userPreferred ?? anime.title.romaji ?? String(anime.id), format: anime.format ?? 'UNKNOWN', episode, aired: prepared.aired, results }
    appendFileSync(`${dir}/results.jsonl`, `${JSON.stringify(row)}\n`)
    rows.push(row)
    tested++

    const said = results.map(r => `${r.site} ${r.status}${r.files.length ? ` ${r.files.length}` : ''}${r.truth?.fitting ? ` (${r.truth.fitting} listed)` : ''} ${(r.ms / 1000).toFixed(1)}s`).join(' | ')
    console.log(`[${position}] ${row.format} ${row.title.slice(0, 40)} ep ${episode}/${prepared.aired}  ${said}`)

    // a site that says too many requests three times in a row gets the rest of the day off
    for (const r of results) {
      if (/\b429\b/.test(r.error ?? '')) throttled[r.site] = (throttled[r.site] ?? 0) + 1
      else if (r.status !== 'error') throttled[r.site] = 0
    }
    const tired = Object.entries(throttled).find(([, n]) => n >= 3)
    if (tired) {
      stopping = `${tired[0]} kept answering 429 (too many requests)`
      return
    }
    if (Object.values(throttled).some(n => n > 0)) await sleep(65_000)
  }
}

console.log(`${mode} pass, run ${run}: ${jobs.length} anime, ${done.size} done before, testing ${[...extensions.keys()].join(', ')}`)
for (const [i, { anime, episodes }] of jobs.entries()) {
  if (stopping) break
  await testAnime(`${i + 1}/${jobs.length}`, anime, episodes)
}

const finished = !stopping
const final = { ...meta, ...(finished && { finished: new Date().toISOString() }) }
writeFileSync(`${dir}/meta.json`, JSON.stringify(final, null, 1))
const previous = earlier.filter(r => r !== run && r.endsWith(`-${mode}`) && metaOf(r).finished).at(-1)
const about = [
  `${deep ? 'Deep pass: up to four episodes of each sampled anime, three files each.' : 'Wide pass: one episode of each anime, one file each.'} Run ${run}, started ${final.started}${'finished' in final ? `, finished ${final.finished}` : ', not finished yet'}.`,
  '',
  `Tested ${rows.length} episodes of ${new Set(rows.map(row => row.id)).size} anime. Build: ${final.build}, versions ${Object.entries(final.versions).map(([site, version]) => `${site} ${version}`).join(', ')}.`,
  '',
  `Requests in the last session: ${Object.entries(used).map(([site, n]) => `${site} ${n}`).join(', ') || 'none'}.`,
  '',
  'Mirai has no per-episode list to compare with, so an empty Mirai answer for a show it has a subtitle page for counts as maybe, not miss.'
]
writeFileSync(`${dir}/report.md`, report(rows, previous ? readRows(previous) : [], about))
console.log(`\n${stopping ? `stopped: ${stopping}. run the same command again to continue` : 'finished'}`)
console.log(`report: ${dir}/report.md`)
