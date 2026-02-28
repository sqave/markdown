import { build } from 'esbuild';

await build({
  entryPoints: ['renderer/app.js'],
  bundle: true,
  outfile: 'renderer/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  loader: { '.js': 'js' },
});
