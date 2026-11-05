import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const escape = (value) =>
  String(value ?? 'нет данных').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
export function writeTestReport() {
  const metrics = read('reports/metrics.json');
  if (!metrics) throw new Error('Сначала выполните npm run quality');
  const unit = read('reports/tests.json');
  const browser = read('reports/e2e.json');
  const cases = [];
  function walk(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          cases.push({
            title: spec.title,
            status: test.status,
            seconds: (test.results.at(-1)?.duration ?? 0) / 1000,
          });
        }
      }
      walk(suite.suites);
    }
  }
  walk(browser?.suites);
  const names = {
    10: 'Список и условие задания',
    11: 'Фильтр статусов',
    13: 'Отправка работы',
    14: 'Переходы состояний',
    15: 'Очередь преподавателя',
    16: 'Оценка и отклонение',
    18: 'Уведомления',
  };
  const tasks = Object.entries(names).map(([id, name]) => {
    const related = cases.filter((c) => [...c.title.matchAll(/T(\d+)/g)].some((m) => m[1] === id));
    return {
      id: Number(id),
      name,
      tests: related.length,
      passed: related.length > 0 && related.every((c) => c.status === 'expected'),
    };
  });
  writeFileSync(
    'reports/task-results.json',
    JSON.stringify({ measuredAt: metrics.measuredAt, scope: 'prototype', tasks }, null, 2) + '\n',
  );
  const rows = (items) =>
    items
      .map((row) => '<tr>' + row.map((v) => `<td>${escape(v)}</td>`).join('') + '</tr>')
      .join('');
  const table = (headers, items) =>
    `<table><thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows(items)}</tbody></table>`;
  const metricsRows = [
    [
      'Тесты Vitest: успешно / ошибки / пропущено',
      `${metrics.testsPassed} / ${metrics.testsFailed} / ${metrics.testsSkipped}`,
    ],
    [
      'Тесты браузера: успешно / ошибки / пропущено',
      `${metrics.browserTestsPassed} / ${metrics.browserTestsFailed} / ${metrics.browserTestsSkipped}`,
    ],
    ['ESLint: ошибки / предупреждения', `${metrics.lintErrors} / ${metrics.lintWarnings}`],
    [
      'Покрытие строк / ветвей, %',
      `${metrics.lineCoveragePercent} / ${metrics.branchCoveragePercent}`,
    ],
    [
      'Vitest / браузер / сборка / все проверки, с',
      `${metrics.testSeconds} / ${metrics.browserSeconds} / ${metrics.buildSeconds} / ${metrics.qualitySeconds}`,
    ],
  ];
  const unitCases =
    unit?.testResults.flatMap((file) =>
      file.assertionResults.map((test) => [test.fullName, test.status]),
    ) ?? [];
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>КПО №7 — результаты тестирования</title>
<style>body{max-width:1100px;margin:40px auto;padding:0 24px;font:16px/1.5 'Segoe UI',sans-serif;color:#24332a}h1{font-size:30px}h2{margin-top:32px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{text-align:left;border:1px solid #ccd2cd;padding:8px 12px;vertical-align:top}th{background:#edf2ee}.status{padding:14px;background:${metrics.qualityPassed ? '#e4f2e6' : '#ffe8e5'};}code{overflow-wrap:anywhere}.small{font-size:14px;color:#536058}</style>
<h1>Лабораторная работа №7. Отчёт о тестировании</h1>
<p class="status">${metrics.qualityPassed ? 'Все обязательные проверки пройдены' : 'Есть ошибки или незавершённые проверки'}</p>
<p>Замер: ${escape(metrics.measuredAt)}<br>Коммит: <code>${escape(metrics.commit)}</code></p>
${table(['Метрика', 'Значение'], metricsRows)}
<p class="small">Покрытие: серверные исходники без точки запуска и хранилище прототипа. Компоненты React проверяются пользовательскими сценариями; их покрытие строк здесь не измерено. Сеть браузера отключена.</p>
<h2>Задачи текущего этапа</h2>
${table(
  ['№', 'Задача', 'Связанных тестов', 'Результат'],
  tasks.map((t) => [t.id, t.name, t.tests, t.passed ? 'Пройдено' : 'Не подтверждено']),
)}
<p class="small">Один сценарий может проверять несколько задач. Эта таблица не означает завершение всех задач полного проекта.</p>
<h2>Пользовательские сценарии</h2>${table(
    ['Сценарий', 'Статус', 'Время, с'],
    cases.map((c) => [
      c.title,
      c.status === 'expected' ? 'Пройдено' : c.status,
      c.seconds.toFixed(3),
    ]),
  )}
<h2>Модульные и интеграционные тесты</h2>${table(['Тест', 'Статус'], unitCases)}
<p>Подробный отчёт Playwright: <code>npm run test:report</code>. При ошибке в нём доступны снимок экрана и трассировка. Отчёты JUnit и JSON находятся рядом с этой страницей.</p></html>`;
  writeFileSync('reports/summary.html', html);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeTestReport();
