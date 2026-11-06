import { PrismaClient } from '@prisma/client';
import { hashPassword } from './security.js';

export async function seedDemo(db: PrismaClient) {
  const secret = await hashPassword('Study2026!');
  for (const data of [
    { id: 'demo-admin', name: 'Администратор', email: 'admin@study.local', role: 'admin' as const },
    {
      id: 'demo-teacher',
      name: 'Алексей Романов',
      email: 'teacher@study.local',
      role: 'teacher' as const,
    },
    {
      id: 'demo-student',
      name: 'Денис Потанцев',
      email: 'student@study.local',
      role: 'student' as const,
    },
  ])
    await db.user.upsert({
      where: { email: data.email },
      create: { ...data, passwordHash: secret },
      update: {},
    });
  const teacher = await db.user.findUniqueOrThrow({ where: { email: 'teacher@study.local' } });
  await db.course.upsert({
    where: { id: 'demo-course' },
    create: {
      id: 'demo-course',
      teacherId: teacher.id,
      title: 'Конструирование программного обеспечения',
      description:
        'Практические работы: проектирование, реализация и проверка программной системы.',
    },
    update: {},
  });
  for (const [id, title, description] of [
    [
      'demo-design',
      'Проектирование системы',
      'Опишите роли пользователей и основные сценарии. Приложите диаграммы компонентов и развёртывания.',
    ],
    [
      'demo-testing',
      'Автоматическое тестирование',
      'Проверьте основной сценарий, ошибочные данные и ограничения доступа. Приложите результаты тестов.',
    ],
    [
      'demo-release',
      'Отчёт о релизе',
      'Представьте готовое приложение, результаты реализации и статистику проекта.',
    ],
  ])
    await db.assignment.upsert({
      where: { id: id! },
      create: {
        id: id!,
        title: title!,
        description: description!,
        criteria: 'Полнота решения — 40 баллов; корректность — 40; оформление — 20.',
        courseId: 'demo-course',
        deadline: new Date(Date.now() + 30 * 86400000),
      },
      update: {},
    });
}
