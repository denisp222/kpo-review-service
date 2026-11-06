import { test, expect, type Page } from '@playwright/test';
const suffix = () => Date.now() + '-' + Math.random().toString(16).slice(2, 8);
async function login(page: Page, role = 'teacher') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(role + '@study.local');
  await page.getByLabel('Пароль', { exact: true }).fill('Study2026!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
}
async function register(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
  await page.getByLabel('Имя и фамилия').fill(name);
  const email = 'student-' + suffix() + '@test.local';
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
  return email;
}
async function createCourse(page: Page, title: string) {
  await page.getByRole('button', { name: 'Добавить курс', exact: true }).click();
  await page.getByLabel('Название курса').fill(title);
  await page
    .getByLabel('Описание курса')
    .fill('Практические работы по проектированию и тестированию');
  await page.getByRole('button', { name: 'Создать курс', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
test('T1 T2 регистрация, вход, выход и ошибка пароля', async ({ page }) => {
  const email = await register(page, 'Новый студент');
  await page.reload();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вход в систему' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('Wrong1234');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Неверный');
  await page.getByLabel('Пароль', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
});
test('T4 T5 T6 T7 T8 создание, поиск, редактирование и удаление курса', async ({ page }) => {
  await login(page);
  const title = 'Тестирование ' + suffix();
  await createCourse(page, title);
  await page.getByRole('button', { name: 'Изменить курс', exact: true }).click();
  await page.getByLabel('Название курса').fill(title + ' обновлено');
  await page.getByRole('button', { name: 'Сохранить курс', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: title + ' обновлено', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '← Все курсы' }).click();
  await page.getByRole('searchbox').fill(title.toLowerCase());
  await expect(page.getByRole('heading', { name: title + ' обновлено' })).toBeVisible();
  await page.getByRole('heading', { name: title + ' обновлено' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Удалить курс', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мои курсы' })).toBeVisible();
  await page.getByRole('searchbox').fill(title);
  await expect(page.getByText('Курсы не найдены. Измените поисковый запрос.')).toBeVisible();
});
test('T3 T9 T10 T11 T12 T13 T14 T15 T16 T17 T18 T19 T21 полный цикл с файлом и рецензией', async ({
  browser,
  page,
}, info) => {
  await login(page);
  const title = 'Практикум ' + suffix();
  await createCourse(page, title);
  const courseUrl = page.url();
  await page.getByRole('button', { name: 'Добавить задание', exact: true }).click();
  await page.getByLabel('Название задания').fill('Проверка API');
  await page.getByLabel('Условие задания').fill('Реализуйте и проверьте API рецензирования.');
  await page.getByLabel('Критерии оценки').fill('Корректность, права доступа, обработка ошибок.');
  await page
    .getByLabel('Срок сдачи')
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page.getByLabel('Материалы задания').setInputFiles({
    name: 'Условие.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Условие практической работы'),
  });
  await page.getByRole('button', { name: 'Создать задание', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проверка API', exact: true })).toBeVisible();
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3188' });
  const student = await context.newPage();
  await register(student, 'Студент полного сценария');
  await student.goto(courseUrl);
  await student.getByRole('heading', { name: 'Проверка API', exact: true }).click();
  const download = student.waitForEvent('download');
  await student.getByRole('link').filter({ hasText: 'Условие.txt' }).click();
  expect((await download).suggestedFilename()).toBe('Условие.txt');
  await student.getByLabel('Файл работы', { exact: true }).setInputFiles({
    name: 'Решение.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Ответ студента с проверками API'),
  });
  await student.getByLabel('Комментарий к работе').fill('Основные сценарии проверены');
  await student.getByRole('button', { name: 'Отправить на проверку', exact: true }).click();
  await expect(student.getByRole('heading', { name: 'Работа на проверке' })).toBeVisible();
  await page.getByRole('link', { name: 'На проверке', exact: true }).click();
  await page.getByRole('link').filter({ hasText: title }).click();
  await page.getByLabel('Оценка от 0 до 100').fill('85');
  await page
    .getByLabel('Комментарий преподавателя')
    .fill('Основные сценарии реализованы правильно.');
  await page.getByLabel('Рекомендации').fill('Добавить проверку отрицательных значений.');
  await info.attach('Форма рецензии релиза', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Сохранить рецензию', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Результат проверки' })).toBeVisible();
  await student.getByRole('link', { name: /Уведомления/ }).click();
  await student.getByRole('button', { name: 'Открыть результат' }).click();
  await expect(student.getByText('Основные сценарии реализованы правильно.')).toBeVisible();
  await student.reload();
  await expect(student.locator('.grade')).toContainText('85');
  await info.attach('Результат релиза', {
    body: await student.screenshot(),
    contentType: 'image/png',
  });
  await student.getByRole('link', { name: 'История работ', exact: true }).first().click();
  await expect(student.getByRole('cell', { name: '85', exact: true })).toBeVisible();
  await expect(
    student.getByText('Рекомендации: Добавить проверку отрицательных значений.'),
  ).toBeVisible();
  await student.goto(courseUrl);
  await student.getByLabel('Статус', { exact: true }).selectOption('reviewed');
  await expect(student.getByRole('heading', { name: 'Проверка API' })).toBeVisible();
  await student.getByLabel('Статус', { exact: true }).selectOption('empty');
  await expect(student.getByText('Заданий с таким статусом нет.')).toBeVisible();
  await context.close();
});
test('T2 T13 ошибочный файл не отправляется, студент не видит создание курса', async ({ page }) => {
  await register(page, 'Студент проверки файла');
  await expect(page.getByRole('button', { name: 'Добавить курс' })).toHaveCount(0);
  await page.goto('/#/assignment/demo-testing');
  await page.getByLabel('Файл работы', { exact: true }).setInputFiles({
    name: 'virus.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('wrong'),
  });
  await page.getByRole('button', { name: 'Отправить на проверку' }).click();
  await expect(page.getByRole('alert')).toContainText('Разрешены PDF');
  await expect(page.getByRole('heading', { name: 'Отправить работу' })).toBeVisible();
});
test('T20 назначение роли, блокировка и журнал действий', async ({ browser, page }, info) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3188' });
  const other = await context.newPage();
  const email = await register(other, 'Пользователь администрирования');
  await login(page, 'admin');
  let row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('button', { name: 'Изменить' }).click();
  await page.getByLabel('Роль', { exact: true }).selectOption('teacher');
  await page.getByLabel('Заблокировать вход').check();
  await page.getByRole('button', { name: 'Сохранить доступ' }).click();
  row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toContainText('Заблокирован');
  await expect(row).toContainText('Преподаватель');
  await info.attach('Пользователи релиза', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await other.reload();
  await expect(other.getByRole('heading', { name: 'Вход в систему' })).toBeVisible();
  await page.getByRole('link', { name: 'Журнал действий', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: email })).toContainText('user.update');
  await context.close();
});
test('T1 T7 T10 интерфейс работает на узком экране', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page, 'Мобильный студент');
  await page
    .getByRole('heading', { name: 'Конструирование программного обеспечения', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Задания курса' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
