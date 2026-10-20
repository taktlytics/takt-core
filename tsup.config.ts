import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/composition/index.ts', server: 'src/server/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
  },
  {
    entry: { takt: 'src/composition/snippet.iife.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    minify: true,
    sourcemap: true,
    treeshake: true,
  },
  {
    entry: { 'takt.auto': 'src/composition/auto.iife.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    minify: true,
    sourcemap: true,
    treeshake: true,
  },
])
