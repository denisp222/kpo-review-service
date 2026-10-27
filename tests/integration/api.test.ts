import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/http/app.js';
import { PrismaRepository } from '../../src/infrastructure/prisma-repository.js';
import { ReviewService } from '../../src/reviews/service.js';
import type { Actor, INotificationRepo, IReviewRepo } from '../../src/reviews/types.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('Нужна отдельная TEST_DATABASE_URL с именем базы, заканчивающимся на _test');
}
const db = new PrismaClient({ datasources: { db: { url } } });
const repo = new PrismaRepository(db);
const identities: Record<string, Actor> = {
  teacher: { id: 'teacher-1', role: 'teacher' },
  student: { id: 'student-1', role: 'student' },
  outsider: { id: 'student-2', role: 'student' },
};
const auth = (header: string | undefined) => identities[header ?? ''];
const app = createApp(new ReviewService(repo), repo, auth);
const input = { grade: 85, comment: 'Верно', recommendations: 'Добавить тесты' };

beforeAll(async () => {
  await db.$connect();
});
beforeEach(async () => {
  await db.notification.deleteMany();
  await db.work.deleteMany();
  await db.work.create({ data: { id: 'work-1', studentId: 'student-1', teacherId: 'teacher-1' } });
});
afterAll(async () => {
  await db.$disconnect();
});

it('проверяет доступность HTTP-сервера', async () => {
  await request(app).get('/health').expect(200, { status: 'ok' });
});
it('запрос без авторизации не меняет БД', async () => {
  await request(app).post('/api/works/work-1/review').send(input).expect(401);
  expect((await repo.findWork('work-1'))?.status).toBe('submitted');
});
it('читает работу только для её владельца', async () => {
  const response = await request(app)
    .get('/api/works/work-1')
    .set('Authorization', 'student')
    .expect(200);
  expect(response.body).toMatchObject({ id: 'work-1', grade: null });
  await request(app).get('/api/works/work-1').set('Authorization', 'outsider').expect(403);
  await request(app).get('/api/works/missing').set('Authorization', 'teacher').expect(404);
});
it('сохраняет рецензию и уведомление в PostgreSQL', async () => {
  await request(app)
    .post('/api/works/work-1/review')
    .set('Authorization', 'teacher')
    .send(input)
    .expect(200);
  expect(await repo.findWork('work-1')).toMatchObject({ ...input, status: 'reviewed' });
  const response = await request(app)
    .get('/api/notifications')
    .set('Authorization', 'student')
    .expect(200);
  expect(response.body).toHaveLength(1);
  expect(response.body[0]).toMatchObject({ workId: 'work-1', message: 'Работа проверена' });
  await request(app).get('/api/notifications').set('Authorization', 'outsider').expect(200, []);
  await request(app).get('/api/notifications').set('Authorization', 'teacher').expect(403);
});
it('отклоняет работу с причиной и уведомляет студента', async () => {
  await request(app)
    .post('/api/works/work-1/reject')
    .set('Authorization', 'teacher')
    .send({ reason: 'Нет решения' })
    .expect(200);
  expect(await repo.findWork('work-1')).toMatchObject({
    status: 'rejected',
    grade: null,
    comment: 'Нет решения',
  });
  expect(await repo.listForStudent('student-1')).toEqual([
    expect.objectContaining({ message: 'Работа отклонена' }),
  ]);
});
it('повторная проверка не создаёт лишнее уведомление', async () => {
  await request(app)
    .post('/api/works/work-1/review')
    .set('Authorization', 'teacher')
    .send(input)
    .expect(200);
  await request(app)
    .post('/api/works/work-1/review')
    .set('Authorization', 'teacher')
    .send(input)
    .expect(409);
  expect(await db.notification.count()).toBe(1);
});
it('два одновременных решения сохраняют только один результат', async () => {
  const responses = await Promise.all(
    [70, 90].map((grade) =>
      request(app)
        .post('/api/works/work-1/review')
        .set('Authorization', 'teacher')
        .send({ ...input, grade }),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(await db.notification.count()).toBe(1);
  expect([70, 90]).toContain((await repo.findWork('work-1'))?.grade);
});
it('ошибочные входные данные не создают записей', async () => {
  await request(app)
    .post('/api/works/work-1/review')
    .set('Authorization', 'teacher')
    .send({ ...input, grade: 101 })
    .expect(400);
  await request(app).post('/api/works/work-1/reject').set('Authorization', 'teacher').expect(400);
  await request(app).post('/api/works/work-1/review').set('Authorization', 'teacher').expect(400);
  expect(await db.notification.count()).toBe(0);
});
it('повреждённый JSON и слишком большой запрос возвращают ошибки клиента', async () => {
  await request(app)
    .post('/api/works/work-1/review')
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
  await request(app)
    .post('/api/works/work-1/review')
    .send({ comment: 'x'.repeat(17000) })
    .expect(413);
});
it('неизвестный маршрут возвращает 404', async () => {
  await request(app).get('/unknown').expect(404);
});
it('при сбое записи уведомления откатывает изменение работы', async () => {
  await db.$executeRawUnsafe(
    `CREATE FUNCTION fail_lab_notification() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test notification failure'; END; $$ LANGUAGE plpgsql`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER fail_lab_notification BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION fail_lab_notification()`,
  );
  try {
    await request(app)
      .post('/api/works/work-1/review')
      .set('Authorization', 'teacher')
      .send(input)
      .expect(500);
    expect((await repo.findWork('work-1'))?.status).toBe('submitted');
    expect(await db.notification.count()).toBe(0);
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_lab_notification ON "Notification"');
    await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_lab_notification()');
  }
});
it('не раскрывает внутреннюю ошибку в HTTP-ответе', async () => {
  const failing: IReviewRepo = {
    findWork: vi.fn().mockRejectedValue(new Error('private connection details')),
    saveDecision: vi.fn(),
  };
  const notifications: INotificationRepo = { listForStudent: vi.fn() };
  const brokenApp = createApp(new ReviewService(failing), notifications, auth);
  await request(brokenApp)
    .get('/api/works/work-1')
    .set('Authorization', 'student')
    .expect(500, { error: 'Внутренняя ошибка сервера' });
});
