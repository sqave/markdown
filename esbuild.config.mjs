import { build } from 'esbuild';
import { unlinkSync, readdirSync } from 'fs';

// Clean stale chunks from previous builds
for (const f of readdirSync('renderer')) {
  if (f.startsWith('chunk-') && f.endsWith('.js')) unlinkSync(`renderer/${f}`);
}

const result = await build({
  entryPoints: ['renderer/boot-src.js'],
  bundle: true,
  outdir: 'renderer',
  entryNames: 'boot',
  chunkNames: 'chunk-[hash]',
  format: 'esm',
  splitting: true,
  platform: 'browser',
  target: 'safari17',
  loader: { '.js': 'js' },
  minify: true,
  treeShaking: true,
  drop: ['console', 'debugger'],
  legalComments: 'none',
  metafile: true,
});

// Print bundle analysis when ANALYZE env is set
if (process.env.ANALYZE) {
  const text = await import('esbuild').then(m => m.analyzeMetafile(result.metafile));
  console.log(text);
}
