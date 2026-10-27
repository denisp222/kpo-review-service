import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const stages = [
  'lab5-baseline',
  'prototype',
  'infrastructure',
  'implementation-1',
  'implementation-2',
  'implementation-3',
  'testing',
  'release',
];
const stage = process.argv[process.argv.indexOf('--stage') + 1];
if (!stages.includes(stage)) throw new Error(`Укажите --stage: ${stages.join(', ')}`);
const result = spawnSync(process.execPath, ['scripts/quality.mjs'], {
  stdio: 'inherit',
  env: process.env,
});
if (result.status !== 0) process.exit(1);
const metrics = JSON.parse(readFileSync('reports/metrics.json', 'utf8'));
const snapshot = { stage, ...metrics };
mkdirSync('docs/metrics', { recursive: true });
const stamp = snapshot.measuredAt.replace(/[:.]/g, '-');
const file = `docs/metrics/${stamp}-${stage}.json`;
writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Снимок этапа: ${file}`);
