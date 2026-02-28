import { build } from 'esbuild';

const result = await build({
  entryPoints: ['renderer/app.js'],
  bundle: true,
  outfile: 'renderer/bundle.js',
  format: 'iife',
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
