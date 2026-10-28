import { spawnSync } from 'node:child_process';

for (const args of [
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'],
  ['prototype/build.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
