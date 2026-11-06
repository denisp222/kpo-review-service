import { expect, it } from 'vitest';
import {
  email,
  password,
  text,
  fileName,
  fileContent,
  hashPassword,
  verifyPassword,
  tokenHash,
} from '../../src/release/security.js';
it('T1 хеширует пароль с индивидуальной солью и проверяет его', async () => {
  const first = await hashPassword('Study2026!');
  const second = await hashPassword('Study2026!');
  expect(first).not.toBe(second);
  expect(first).not.toContain('Study2026!');
  expect(await verifyPassword('Study2026!', first)).toBe(true);
  expect(await verifyPassword('wrong-password', first)).toBe(false);
  expect(await verifyPassword('Study2026!', 'broken')).toBe(false);
});
it('T1 нормализует email, текст и проверяет границы пароля', () => {
  expect(email(' Test@Study.Local ')).toBe('test@study.local');
  expect(text(' текст ', 'Поле')).toBe('текст');
  expect(password('12345678')).toHaveLength(8);
  expect(password('x'.repeat(128))).toHaveLength(128);
  expect(text('', 'Комментарий', 2000, 0)).toBe('');
  expect(tokenHash('token')).toHaveLength(64);
});
it.each([undefined, 1, '', 'x', 'x@', 'x@host', 'a b@host.local', 'x'.repeat(255)])(
  'T1 отклоняет email %s',
  (value) => expect(() => email(value)).toThrow(),
);
it.each([undefined, 123, '', '1234567', 'x'.repeat(129)])('T1 отклоняет пароль %s', (value) =>
  expect(() => password(value)).toThrow(),
);
it.each([
  undefined,
  '',
  '../file.txt',
  'a/b.txt',
  'a\\b.txt',
  'a:1.txt',
  'file.exe',
  'file\n.txt',
  '%XX',
  'a'.repeat(181) + '.txt',
])('T12 отклоняет имя файла %s', (value) => expect(() => fileName(value)).toThrow());
it.each(['report.pdf', 'work.docx', 'answer.txt', 'project.zip'])('T12 принимает имя %s', (value) =>
  expect(fileName(value)).toBe(value),
);
it('T12 поддерживает русское имя файла', () =>
  expect(fileName(encodeURIComponent('Работа №1.txt'))).toBe('Работа №1.txt'));
it.each([
  ['answer.txt', Buffer.from('Ответ')],
  ['file.pdf', Buffer.from('%PDF-1.4 example')],
  ['file.zip', Buffer.from('504b030400', 'hex')],
  ['file.docx', Buffer.from('504b030400', 'hex')],
])('T12 проверяет содержимое %s', (name, content) =>
  expect(fileContent(name as string, content)).toEqual(content),
);
it.each([
  ['a.txt', Buffer.alloc(0)],
  ['a.txt', Buffer.alloc(5 * 1024 * 1024 + 1)],
  ['a.txt', 'text'],
  ['a.txt', Buffer.from([255])],
  ['a.txt', Buffer.from([0])],
  ['a.pdf', Buffer.from('wrong')],
  ['a.docx', Buffer.from('wrong')],
  ['a.zip', Buffer.from('wrong')],
])('T12 отклоняет содержимое %s', (name, content) =>
  expect(() => fileContent(name as string, content)).toThrow(),
);
