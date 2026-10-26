import { cp, readFile, rm } from 'node:fs/promises'

import { build } from 'esbuild'

// public/ is the whole public site, and it is the only folder that ever gets uploaded
await rm('public', { recursive: true, force: true })

// every extension in index.json is src/<name>/index.ts, built into one public/<name>.js:
// hayase imports it from a blob, so bare imports can't work.
// no version in the header: that lives in index.json only, so bumping it never changes the build
const manifest = JSON.parse(await readFile('index.json', 'utf8'))
const names = manifest.map(({ code }) => code.slice(code.lastIndexOf('/') + 1, -'.js'.length))

await build({
  entryPoints: Object.fromEntries(names.map(name => [name, `src/${name}/index.ts`])),
  outdir: 'public',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  legalComments: 'inline',
  banner: { js: '// ext-ara, built file' },
  logLevel: 'info'
})

await cp('index.json', 'public/index.json')
await cp('site', 'public', { recursive: true })
