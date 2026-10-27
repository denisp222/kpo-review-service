import { expect, it } from 'vitest';
import { demoAuth } from '../../src/http/demo-auth.js';

const teacher = 'test-teacher-token-000000000000';
const student = 'test-student-token-000000000000';
const authenticate = demoAuth(teacher, student);

it.each([
  [teacher, 'teacher'],
  [student, 'student'],
])('определяет роль по тестовому токену %s', (token, role) => {
  expect(authenticate(`Bearer ${token}`)?.role).toBe(role);
});
it.each([undefined, 'Basic abc', 'Bearer short', 'Bearer invalid-token-000000000000000'])(
  'не принимает чужие данные авторизации: %s',
  (header) => {
    expect(authenticate(header)).toBeUndefined();
  },
);
it.each([
  ['short', student],
  [teacher, 'short'],
  [teacher, teacher],
])('проверяет настройки демонстрационной авторизации', (first, second) => {
  expect(() => demoAuth(first, second)).toThrow();
});
