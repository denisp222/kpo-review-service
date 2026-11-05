import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const first = 'Описание требований к системе';
const second = 'Модель данных проекта';
const third = 'Тестирование модуля';
const url = pathToFileURL(resolve('prototype/dist/prototype.html')).href;

async function role(page: Page, value: 'student' | 'teacher') {
  await page.getByRole('combobox', { name: 'Роль' }).selectOption(value);
}
async function open(page: Page, title: string) {
  await page.getByRole('button', { name: new RegExp(title) }).click();
}
async function submit(page: Page, name = 'Требования.txt', bytes = 128) {
  await open(page, first);
  await page.getByLabel('Файл работы').setInputFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(bytes, 65),
  });
  await page.locator('#submission-comment').fill('Определены роли и критерии готовности.');
  await page.getByRole('button', { name: 'Отправить на проверку' }).click();
}
async function review(page: Page, grade = '85') {
  await page.locator('#grade').fill(grade);
  await page.locator('#review-comment').fill('Роли и функции описаны понятно.');
  await page.locator('#recommendations').fill('Уточнить критерии отправки файлов.');
}
async function pending(page: Page) {
  await role(page, 'teacher');
  await open(page, second);
}

test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Мои задания', exact: true })).toBeVisible();
});

test('[T10] список и условие задания доступны без сети', async ({ page }) => {
  for (const title of [first, second, third])
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
  await open(page, first);
  await expect(page.getByRole('heading', { name: 'Условие задания' })).toBeVisible();
  await expect(page.getByText('Сформулирована цель системы', { exact: true })).toBeVisible();
});

test('[T11] фильтры и пустой результат', async ({ page }) => {
  for (const [status, title] of [
    ['Не сдано', first],
    ['На проверке', second],
    ['Проверено', third],
  ]) {
    await page.locator('.filters button').filter({ hasText: status }).click();
    await expect(page.getByRole('button', { name: new RegExp(title!) })).toBeVisible();
    for (const other of [first, second, third].filter((item) => item !== title))
      await expect(page.getByRole('button', { name: new RegExp(other) })).toHaveCount(0);
  }
  await page.locator('.filters button').filter({ hasText: 'Отклонено' }).click();
  await expect(page.getByText('Таких заданий пока нет')).toBeVisible();
  await page.getByRole('button', { name: 'Показать все', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(first) })).toBeVisible();
});

test('[T13] файл обязателен', async ({ page }) => {
  await open(page, first);
  await page.getByRole('button', { name: 'Отправить на проверку' }).click();
  await expect(page.getByRole('alert')).toContainText('Выберите файл');
});
for (const ext of ['pdf', 'docx', 'txt', 'zip']) {
  test(`[T13] допустимый формат ${ext}`, async ({ page }) => {
    await submit(page, `Работа.${ext}`);
    await expect(page.getByRole('heading', { name: 'Работа отправлена' })).toBeVisible();
  });
}
for (const [name, bytes, message] of [
  ['program.exe', 32, 'Допустимы файлы'],
  ['empty.txt', 0, 'Размер файла'],
  ['large.pdf', 5 * 1024 * 1024 + 1, 'Размер файла'],
] as const) {
  test(`[T13] отклонение файла ${name}`, async ({ page }) => {
    await submit(page, name, bytes);
    await expect(page.getByRole('alert')).toContainText(message);
    await role(page, 'teacher');
    await expect(page.getByRole('button', { name: new RegExp(first) })).toHaveCount(0);
  });
}

test('[T13 T14] отправка сохраняется после перезагрузки, повтор недоступен', async ({ page }) => {
  await submit(page);
  await page.reload();
  await open(page, first);
  await expect(page.getByRole('heading', { name: 'Работа отправлена' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отправить на проверку' })).toHaveCount(0);
});

test('[T15] очередь содержит только ожидающие работы', async ({ page }) => {
  await role(page, 'teacher');
  await expect(page.getByRole('button', { name: new RegExp(second) })).toBeVisible();
  for (const title of [first, third])
    await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(0);
});

test('[T10 T13 T14 T15 T16 T18] полный сценарий отправки и рецензии', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await submit(page);
  await role(page, 'teacher');
  await open(page, first);
  await review(page);
  await info.attach('Форма рецензии', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Сохранить рецензию' }).click();
  await expect(page.getByRole('status')).toContainText('Рецензия сохранена');
  await page.getByRole('button', { name: 'К списку работ' }).click();
  await expect(page.getByRole('button', { name: new RegExp(first) })).toHaveCount(0);
  await role(page, 'student');
  await expect(page.locator('.unread-count')).toHaveText('1');
  await page.getByRole('button', { name: /Уведомления/ }).click();
  await page.getByRole('button', { name: /выставлена оценка 85/ }).click();
  await expect(page.locator('.grade')).toContainText('85');
  await expect(page.getByText('Роли и функции описаны понятно.', { exact: true })).toBeVisible();
  await expect(page.getByText('Уточнить критерии отправки файлов.', { exact: true })).toBeVisible();
  await expect(page.locator('.unread-count')).toHaveCount(0);
  await info.attach('Результат студента', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await page.reload();
  await open(page, first);
  await expect(page.locator('.grade')).toContainText('85');
  expect(errors).toEqual([]);
});

for (const grade of ['-1', '101', '2.5', '']) {
  test(`[T16] недопустимая оценка ${grade || 'пустая'}`, async ({ page }) => {
    await pending(page);
    await review(page, grade);
    await page.getByRole('button', { name: 'Сохранить рецензию' }).click();
    await expect(page.getByRole('alert')).toContainText('целым числом от 0 до 100');
    await role(page, 'student');
    await expect(page.locator('.unread-count')).toHaveCount(0);
  });
}
for (const [field, message] of [
  ['#review-comment', 'Комментарий'],
  ['#recommendations', 'Рекомендации'],
]) {
  test(`[T16] обязательное поле ${message}`, async ({ page }) => {
    await pending(page);
    await review(page);
    await page.locator(field!).fill('   ');
    await page.getByRole('button', { name: 'Сохранить рецензию' }).click();
    await expect(page.getByRole('alert')).toContainText(`${message}: требуется текст`);
  });
}

test('[T14 T15 T16 T18] отклонение требует причину и не выставляет оценку', async ({ page }) => {
  await pending(page);
  await page.getByRole('button', { name: 'Отклонить', exact: true }).click();
  await page.getByRole('button', { name: 'Отклонить работу', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Причина отклонения');
  await page.locator('#reason').fill('Отсутствуют связи между сущностями.');
  await page.getByRole('button', { name: 'Отклонить работу', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Работа отклонена');
  await page.getByRole('button', { name: 'К списку работ' }).click();
  await expect(page.getByRole('button', { name: new RegExp(second) })).toHaveCount(0);
  await role(page, 'student');
  await open(page, second);
  await expect(
    page.getByText('Отсутствуют связи между сущностями.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.grade')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Отправить на проверку' })).toHaveCount(0);
});

test('[T16] студент видит результат без формы выставления оценки', async ({ page }) => {
  await open(page, third);
  await expect(page.locator('.grade')).toContainText('92');
  await expect(page.locator('#grade')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Сохранить рецензию' })).toHaveCount(0);
});

test('[T18] пустой список уведомлений', async ({ page }) => {
  await page.getByRole('button', { name: /Уведомления/ }).click();
  await expect(page.getByRole('heading', { name: 'Пока нет уведомлений' })).toBeVisible();
});

test('[T18] прочтение одного сообщения не скрывает другое', async ({ page }) => {
  await submit(page);
  await role(page, 'teacher');
  for (const title of [first, second]) {
    await open(page, title);
    await review(page);
    await page.getByRole('button', { name: 'Сохранить рецензию' }).click();
    await expect(page.getByRole('status')).toContainText('Рецензия сохранена');
    await page.getByRole('button', { name: 'К списку работ' }).click();
  }
  await role(page, 'student');
  await expect(page.locator('.unread-count')).toHaveText('2');
  await page.getByRole('button', { name: /Уведомления/ }).click();
  await page.getByRole('button', { name: new RegExp(first) }).click();
  await expect(page.locator('.unread-count')).toHaveText('1');
});

test('[T10 T13] мобильный экран: отправка доступна без горизонтальной прокрутки', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await submit(page);
  await expect(page.getByRole('heading', { name: 'Работа отправлена' })).toBeVisible();
  expect(
    await page
      .locator('body')
      .evaluate((body) => body.scrollWidth <= body.ownerDocument.documentElement.clientWidth),
  ).toBe(true);
});

test('[T10 T14 T18] сброс возвращает исходное состояние', async ({ page }) => {
  await submit(page);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Начать демонстрацию заново' }).click();
  await page.reload();
  await open(page, first);
  await expect(page.getByRole('button', { name: 'Отправить на проверку' })).toBeVisible();
  await expect(page.locator('.unread-count')).toHaveCount(0);
});
