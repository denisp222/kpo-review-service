import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
export function collectMetrics() {
  const lint = read('reports/eslint.json');
  const tests = read('reports/tests.json');
  const coverage = read('reports/coverage/coverage-summary.json');
  const pipeline = read('reports/pipeline.json');
  if (!pipeline) throw new Error('Сначала выполните npm run quality');
  let commit = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* A new repository may not have a commit yet. */
  }
  const metrics = {
    measuredAt: pipeline.measuredAt,
    commit,
    runUrl: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
    lintErrors: lint?.reduce((sum, file) => sum + file.errorCount, 0) ?? null,
    lintWarnings: lint?.reduce((sum, file) => sum + file.warningCount, 0) ?? null,
    testsPassed: tests?.numPassedTests ?? null,
    testsFailed: tests?.numFailedTests ?? null,
    testsSkipped: tests?.numPendingTests ?? null,
    testSeconds: pipeline.steps.find((step) => step.name === 'tests')?.seconds ?? null,
    lineCoveragePercent: coverage?.total.lines.pct ?? null,
    branchCoveragePercent: coverage?.total.branches.pct ?? null,
    buildSeconds: pipeline.steps.find((step) => step.name === 'build')?.seconds ?? null,
    qualitySeconds: pipeline.seconds,
    qualityPassed: pipeline.success,
  };
  writeFileSync('reports/metrics.json', JSON.stringify(metrics, null, 2) + '\n');
  const rows = Object.entries(metrics).map(
    ([key, value]) => `| ${key} | ${value ?? 'нет данных'} |`,
  );
  writeFileSync(
    'reports/metrics.md',
    [
      '# Результаты проверок',
      '',
      '| Метрика | Значение |',
      '| --- | --- |',
      ...rows,
      '',
      'testSeconds включает запуск Vitest и сбор покрытия. qualitySeconds — длительность локального набора проверок без установки зависимостей.',
      'Покрытие рассчитано для src; из расчёта исключён только src/server.ts (запуск HTTP-сервера).',
      '',
    ].join('\n'),
  );
  console.log(JSON.stringify(metrics, null, 2));
  return metrics;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) collectMetrics();
