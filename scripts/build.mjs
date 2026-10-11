import { build } from 'esbuild'

// one file, hayase imports it from a blob so bare imports can't work.
// no version in the header: that lives in index.json only, so bumping it never changes the build
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/mirai.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  legalComments: 'inline',
  banner: { js: '// mirai-ext, built file, edit src/ instead' },
  logLevel: 'info'
})
