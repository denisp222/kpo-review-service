import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['prototype/src/App.tsx'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline',
});
const code = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('prototype/src/style.css', 'utf8');
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Рецензия — прототип КПО №6</title><style>${css}</style></head><body><div id="root"></div><noscript>Для работы прототипа нужен включённый JavaScript.</noscript><script>${code}</script></body></html>`;
mkdirSync('prototype/dist', { recursive: true });
writeFileSync('prototype/dist/prototype.html', html);
console.log(
  `Автономный прототип: prototype/dist/prototype.html (${Math.round(Buffer.byteLength(html) / 1024)} КБ)`,
);
