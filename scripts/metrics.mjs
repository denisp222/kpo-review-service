import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
export function collectMetrics() {
  const lint = read('reports/eslint.json');
  const tests = read('reports/tests.json');
  const coverage = read('reports/coverage/coverage-summary.json');
  const browser = read('reports/e2e.json');
  const pipeline = read('reports/pipeline.json');
  if (!pipeline) throw new Error('РЎРЅР°С‡Р°Р»Р° РІС‹РїРѕР»РЅРёС‚Рµ npm run quality');
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
    browserTestsPassed: browser?.stats.expected ?? null,
    browserTestsFailed: browser?.stats.unexpected ?? null,
    browserTestsSkipped: browser?.stats.skipped ?? null,
    browserSeconds: pipeline.steps.find((step) => step.name === 'browser')?.seconds ?? null,
    qualitySeconds: pipeline.seconds,
    qualityPassed: pipeline.success,
  };
  writeFileSync('reports/metrics.json', JSON.stringify(metrics, null, 2) + '\n');
  const rows = Object.entries(metrics).map(
    ([key, value]) => `| ${key} | ${value ?? 'РЅРµС‚ РґР°РЅРЅС‹С…'} |`,
  );
  writeFileSync(
    'reports/metrics.md',
    [
      '# Р РµР·СѓР»СЊС‚Р°С‚С‹ РїСЂРѕРІРµСЂРѕРє',
      '',
      '| РњРµС‚СЂРёРєР° | Р—РЅР°С‡РµРЅРёРµ |',
      '| --- | --- |',
      ...rows,
      '',
      'testSeconds РІРєР»СЋС‡Р°РµС‚ Р·Р°РїСѓСЃРє Vitest Рё СЃР±РѕСЂ РїРѕРєСЂС‹С‚РёСЏ. qualitySeconds вЂ” РґР»РёС‚РµР»СЊРЅРѕСЃС‚СЊ Р»РѕРєР°Р»СЊРЅРѕРіРѕ РЅР°Р±РѕСЂР° РїСЂРѕРІРµСЂРѕРє Р±РµР· СѓСЃС‚Р°РЅРѕРІРєРё Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№.',
      'РџРѕРєСЂС‹С‚РёРµ СЂР°СЃСЃС‡РёС‚Р°РЅРѕ РґР»СЏ src (РєСЂРѕРјРµ Р·Р°РїСѓСЃРєР° СЃРµСЂРІРµСЂР° src/server.ts) Рё prototype/src/store.ts. Р’РёР·СѓР°Р»СЊРЅС‹Рµ РєРѕРјРїРѕРЅРµРЅС‚С‹ React РїСЂРѕРІРµСЂСЏСЋС‚СЃСЏ РѕС‚РґРµР»СЊРЅС‹РјРё Р±СЂР°СѓР·РµСЂРЅС‹РјРё СЃС†РµРЅР°СЂРёСЏРјРё Рё РІ РїСЂРѕС†РµРЅС‚ РїРѕРєСЂС‹С‚РёСЏ РЅРµ РІС…РѕРґСЏС‚.',
      '',
    ].join('\n'),
  );
  console.log(JSON.stringify(metrics, null, 2));
  return metrics;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) collectMetrics();
