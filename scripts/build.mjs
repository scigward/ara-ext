import { readFileSync } from 'node:fs'

import { build } from 'esbuild'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// one file, hayase imports it from a blob so bare imports can't work
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/mirai.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  legalComments: 'inline',
  banner: { js: `// mirai-ext ${version}, built file, edit src/ instead` },
  logLevel: 'info'
})
