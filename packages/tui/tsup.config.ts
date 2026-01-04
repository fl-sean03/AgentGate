import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.tsx',
    index: 'src/index.tsx',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: true,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
