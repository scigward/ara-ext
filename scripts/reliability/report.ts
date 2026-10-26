// the numbers a run comes down to, as markdown
import type { Truth } from './truth.ts'

// ok: files came back. miss: the site lists a release for this episode and nothing came back.
// maybe: the site has arabic for the show, none of it looks like this episode. none: the site has nothing.
// unchecked: nothing came back and the site could not be asked
export type Status = 'ok' | 'miss' | 'maybe' | 'none' | 'unchecked' | 'error' | 'slow'

export interface FileResult {
  name: string
  lines: number
  arabic: number
  end: number
  warnings: string[]
  hash: string
}

export interface SiteResult {
  site: string
  status: Status
  ms: number
  files: FileResult[]
  error?: string
  truth?: Truth
}

export interface Row {
  id: number
  title: string
  format: string
  episode: number
  aired: number
  results: SiteResult[]
}

const STATUSES: Status[] = ['ok', 'miss', 'maybe', 'none', 'unchecked', 'error', 'slow']

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : 0
}
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const cell = (text: string) => text.replace(/\|/g, '/').replace(/\s+/g, ' ')
const link = (row: Row) => `[${cell(row.title)}](https://anilist.co/anime/${row.id})`
// "only 12 lines" and "only 14 lines" are the same kind of warning
const kind = (warning: string) => warning.replace(/\d+(?:-\d+)?/g, 'N')

function table (head: string[], rows: Array<Array<string | number>>): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n')
}

export function report (rows: Row[], previous: Row[], about: string[]): string {
  const results = rows.flatMap(row => row.results.map(result => ({ row, result })))
  const sites = [...new Set(results.map(r => r.result.site))]
  const formats = [...new Set(rows.map(row => row.format))].sort()
  const count = (site: string, status: Status, format?: string) => results.filter(r => r.result.site === site && r.result.status === status && (!format || r.row.format === format)).length
  const out: string[] = ['# Subtitle extension reliability', '', ...about, '']

  out.push('## By extension', '', 'Found rate: of the episodes the site lists a release for, how often the extension brought one back.', '')
  out.push(table(['extension', 'tested', ...STATUSES, 'found rate', 'files with warnings', 'median', 'p95'], sites.map(site => {
    const mine = results.filter(r => r.result.site === site)
    const ok = count(site, 'ok')
    const missed = count(site, 'miss')
    const times = mine.map(r => r.result.ms)
    const warned = mine.flatMap(r => r.result.files).filter(f => f.warnings.length).length
    return [site, mine.length, ...STATUSES.map(status => count(site, status)), ok + missed ? `${Math.round(ok / (ok + missed) * 100)}%` : '-', warned, seconds(percentile(times, 0.5)), seconds(percentile(times, 0.95))]
  })), '')

  out.push('## By format', '')
  out.push(table(['format', ...sites.flatMap(site => [`${site} ok`, `${site} miss`, `${site} error`])], formats.map(format => [format, ...sites.flatMap(site => [count(site, 'ok', format), count(site, 'miss', format), count(site, 'error', format) + count(site, 'slow', format)])])), '')

  const warnings = new Map<string, { n: number, example: string }>()
  for (const { row, result } of results) {
    for (const file of result.files) {
      for (const warning of file.warnings) {
        const key = `${result.site}: ${kind(warning)}`
        const had = warnings.get(key)
        warnings.set(key, { n: (had?.n ?? 0) + 1, example: had?.example ?? `${link(row)} ep ${row.episode}, ${cell(file.name)}: ${warning}` })
      }
    }
  }
  out.push('## Warnings on returned files', '')
  out.push(warnings.size ? table(['warning', 'files', 'example'], [...warnings].sort((a, b) => b[1].n - a[1].n).map(([key, { n, example }]) => [key, n, example])) : 'None.', '')

  const misses = results.filter(r => r.result.status === 'miss').sort((a, b) => (b.result.truth?.fitting ?? 0) - (a.result.truth?.fitting ?? 0))
  out.push(`## Misses (${misses.length})`, '', 'The site lists releases that look like this episode, but the extension brought nothing back. Most listed first.', '')
  out.push(misses.length ? table(['extension', 'anime', 'format', 'episode', 'fitting / arabic releases'], misses.slice(0, 80).map(({ row, result }) => [result.site, link(row), row.format, `${row.episode} of ${row.aired}`, `${result.truth?.fitting} / ${result.truth?.releases}`])) : 'None.', '')

  // one file handed out for two episodes means one of them got the wrong one
  const seen = new Map<string, { row: Row, site: string }>()
  const twice: string[] = []
  for (const { row, result } of results) {
    for (const file of result.files) {
      const key = `${result.site}:${row.id}:${file.hash}`
      const first = seen.get(key)
      if (first && first.row.episode !== row.episode) twice.push(`${result.site}, ${link(row)}: episode ${first.row.episode} and ${row.episode} got the same file, ${cell(file.name)}`)
      else seen.set(key, { row, site: result.site })
    }
  }
  out.push(`## Same file for two episodes (${twice.length})`, '', twice.length ? twice.slice(0, 50).map(line => `- ${line}`).join('\n') : 'None.', '')

  const errors = new Map<string, Array<{ row: Row, result: SiteResult }>>()
  for (const r of results.filter(r => r.result.status === 'error' || r.result.status === 'slow')) {
    const key = `${r.result.site}: ${r.result.status === 'slow' ? 'answered after 10 s, hayase gives up' : kind(r.result.error ?? '')}`
    errors.set(key, [...errors.get(key) ?? [], r])
  }
  out.push('## Errors', '')
  out.push(errors.size ? table(['error', 'times', 'examples'], [...errors].sort((a, b) => b[1].length - a[1].length).map(([key, list]) => [cell(key), list.length, list.slice(0, 3).map(({ row }) => `${link(row)} ep ${row.episode}`).join(', ')])) : 'None.', '')

  const before = new Map(previous.flatMap(row => row.results.map(result => [`${row.id}:${row.episode}:${result.site}`, result.status] as const)))
  const better: string[] = []
  const worse: string[] = []
  for (const { row, result } of results) {
    const was = before.get(`${row.id}:${row.episode}:${result.site}`)
    if (!was || was === result.status) continue
    const line = `${result.site}, ${link(row)} ep ${row.episode}: ${was} to ${result.status}`
    if (result.status === 'ok') better.push(line)
    else if (was === 'ok') worse.push(line)
  }
  out.push('## Since the last run', '')
  out.push(previous.length ? [`Better (${better.length}):`, ...better.slice(0, 50).map(l => `- ${l}`), '', `Worse (${worse.length}):`, ...worse.slice(0, 50).map(l => `- ${l}`)].join('\n') : 'No earlier run of this kind to compare with.', '')
  return out.join('\n')
}
