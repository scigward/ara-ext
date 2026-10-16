import { cp, rm } from 'node:fs/promises'

import { build } from 'esbuild'

// public/ is the whole public site, and it is the only folder that ever gets uploaded
await rm('public', { recursive: true, force: true })

// one file, hayase imports it from a blob so bare imports can't work.
// no version in the header: that lives in index.json only, so bumping it never changes the build.
// no source map either, the source stays private
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'public/mirai.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  legalComments: 'inline',
  sourcemap: false,
  banner: { js: '// mirai-ext, built file' },
  logLevel: 'info'
})

await cp('index.json', 'public/index.json')
await cp('site', 'public', { recursive: true })
