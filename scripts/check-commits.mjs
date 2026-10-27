import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function check(message) {
  const result = spawnSync(process.execPath, ['node_modules/@commitlint/cli/cli.js'], {
    input: message + '\n',
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.status !== 0) process.exit(1);
}
const head = event.pull_request?.head.sha ?? process.env.GITHUB_SHA;
const base = event.pull_request?.base.sha ?? event.before;
const range = base && !/^0+$/.test(base) ? `${base}..${head}` : head;
const commits = git('rev-list', '--no-merges', range).split('\n').filter(Boolean);
for (const commit of commits) check(git('log', '-1', '--format=%B', commit));
if (event.pull_request) check(event.pull_request.title);
console.log(`Conventional Commits: проверено коммитов ${commits.length}`);
