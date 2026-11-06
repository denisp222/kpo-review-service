import { build } from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
mkdirSync('web/dist', { recursive: true });
await build({
  entryPoints: ['web/src/App.tsx'],
  bundle: true,
  outfile: 'web/dist/app.js',
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline',
});
copyFileSync('web/src/style.css', 'web/dist/style.css');
writeFileSync(
  'web/dist/index.html',
  '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Рецензия — учебные работы</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><noscript>Включите JavaScript для работы приложения.</noscript><script src="/app.js" defer></script></body></html>',
);
console.log('Веб-приложение собрано в web/dist');
