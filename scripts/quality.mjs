import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { collectMetrics } from './metrics.mjs';

// Discard previous reports so a failed check cannot reuse old successful results.
rmSync('reports', { recursive: true, force: true });
mkdirSync('reports', { recursive: true });
const started = performance.now();
const steps = [];
function run(name, script, args = []) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  const step = {
    name,
    success: result.status === 0,
    seconds: Number(((performance.now() - start) / 1000).toFixed(3)),
  };
  steps.push(step);
  return step.success;
}

run('format', 'node_modules/prettier/bin/prettier.cjs', ['--check', '.']);
run('lint', 'node_modules/eslint/bin/eslint.js', [
  '.',
  '--max-warnings=0',
  '--format',
  'json',
  '--output-file',
  'reports/eslint.json',
]);
run('typecheck', 'node_modules/typescript/bin/tsc', ['--noEmit']);
run('tests', 'node_modules/vitest/vitest.mjs', ['run', '--coverage']);
if (steps.every((step) => step.success)) {
  run('build', 'node_modules/typescript/bin/tsc', ['-p', 'tsconfig.build.json']);
}
const pipeline = {
  measuredAt: new Date().toISOString(),
  success: steps.length === 5 && steps.every((step) => step.success),
  seconds: Number(((performance.now() - started) / 1000).toFixed(3)),
  steps,
};
writeFileSync('reports/pipeline.json', JSON.stringify(pipeline, null, 2) + '\n');
collectMetrics();
if (!pipeline.success) process.exitCode = 1;
