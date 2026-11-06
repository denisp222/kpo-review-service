import { PrismaClient } from '@prisma/client';
import request, { type Agent } from 'supertest';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createReleaseApp } from '../../src/release/app.js';
import { seedDemo } from '../../src/release/seed.js';
import { tokenHash } from '../../src/release/security.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Нужна отдельная тестовая БД');
const db = new PrismaClient({ datasources: { db: { url } } });
let dir: string;
let app: ReturnType<typeof createReleaseApp>;
let student: Agent;
let teacher: Agent;
let admin: Agent;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'kpo8-api-'));
  await db.$connect();
});
beforeEach(async () => {
  await db.notification.deleteMany();
  await db.work.deleteMany();
  await db.assignment.deleteMany();
  await db.course.deleteMany();
  await db.storedFile.deleteMany();
  await db.auditEvent.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await seedDemo(db);
  app = createReleaseApp(db, dir);
  student = request.agent(app);
  teacher = request.agent(app);
  admin = request.agent(app);
  for (const [agent, email] of [
    [student, 'student@study.local'],
    [teacher, 'teacher@study.local'],
    [admin, 'admin@study.local'],
  ] as const)
    await agent.post('/api/auth/login').send({ email, password: 'Study2026!' }).expect(200);
});
afterAll(async () => {
  await db.$disconnect();
  await rm(dir, { recursive: true, force: true });
});
const upload = async (
  agent: Agent = student,
  name = 'answer.txt',
  body = Buffer.from('Учебная работа'),
) =>
  (
    await agent
      .post('/api/files')
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', encodeURIComponent(name))
      .send(body)
      .expect(201)
  ).body as { id: string; name: string };
const submit = async () => {
  const file = await upload();
  return (
    await student
      .post('/api/assignments/demo-testing/submit')
      .send({ fileId: file.id, comment: 'Готово' })
      .expect(201)
  ).body as { id: string; fileId: string };
};
const review = { grade: 85, comment: 'Верно', recommendations: 'Добавить примеры' };
it('T1 регистрация создаёт студента, защищённую сессию и событие', async () => {
  const agent = request.agent(app);
  const r = await agent
    .post('/api/auth/register')
    .send({ name: 'Новый Студент', email: ' NEW@study.local ', password: 'Password123!' })
    .expect(201);
  expect(r.body).toMatchObject({ email: 'new@study.local', role: 'student', blocked: false });
  expect(r.body.passwordHash).toBeUndefined();
  expect(String(r.headers['set-cookie'])).toContain('HttpOnly');
  expect(String(r.headers['set-cookie'])).toContain('SameSite=Strict');
  await agent.get('/api/auth/me').expect(200);
  expect(await db.auditEvent.count({ where: { action: 'register' } })).toBe(1);
  await agent.post('/api/auth/logout').expect(200);
  await agent.get('/api/auth/me').expect(401);
});
it('T1 не разрешает самоназначение роли и дубли email', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Новый', email: 'new@study.local', password: 'Password123!', role: 'teacher' })
    .expect(400);
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Новый', email: 'student@study.local', password: 'Password123!' })
    .expect(409);
});
it.each(['missing@study.local', 'student@study.local'])(
  'T1 неверные данные входа для %s',
  async (email) => {
    await request(app).post('/api/auth/login').send({ email, password: 'Wrong1234' }).expect(401);
  },
);
it('T1 отклоняет пустые поля, повреждённый и слишком большой JSON', async () => {
  await request(app).post('/api/auth/register').send({}).expect(400);
  await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
  await teacher
    .post('/api/courses')
    .send({ title: 'x'.repeat(40000) })
    .expect(413);
});
it('T2 не принимает демонстрационные токены и истёкшие сессии', async () => {
  await request(app).get('/api/courses').set('Authorization', 'teacher:demo-teacher').expect(401);
  await request(app)
    .get('/api/courses')
    .set('Cookie', 'session=' + 'a'.repeat(64))
    .expect(401);
  await db.session.updateMany({
    where: { userId: 'demo-student' },
    data: { expiresAt: new Date(0) },
  });
  await student.get('/api/courses').expect(401);
});
it('T2 запрещает изменение с постороннего сайта', async () => {
  await teacher
    .post('/api/courses')
    .set('Origin', 'https://other.example')
    .send({ title: 'Курс', description: 'Описание' })
    .expect(403);
});
it('T3 здоровье сервера и неизвестные маршруты', async () => {
  await request(app).get('/health').expect(200, { status: 'ok' });
  await student.get('/api/missing').expect(404);
  await request(app).get('/missing').expect(404);
});
it('T4 T5 T6 T7 T8 создаёт, находит, изменяет и удаляет курс', async () => {
  const r = await teacher
    .post('/api/courses')
    .send({ title: 'Тестовый курс', description: 'Описание', teacherId: 'other' })
    .expect(201);
  const id = r.body.id;
  expect(r.body.teacherId).toBe('demo-teacher');
  expect((await student.get('/api/courses?q=тестовый').expect(200)).body).toHaveLength(1);
  await teacher
    .patch('/api/courses/' + id)
    .send({ title: 'Изменённый курс', description: 'Новое описание' })
    .expect(200);
  expect((await student.get('/api/courses/' + id).expect(200)).body.title).toBe('Изменённый курс');
  await teacher.delete('/api/courses/' + id).expect(200);
  await student.get('/api/courses/' + id).expect(404);
  expect(await db.auditEvent.count({ where: { targetId: id } })).toBe(3);
});
it('T2 T5 запрещает студенту изменения и преподавателю чужой курс', async () => {
  await student.post('/api/courses').send({ title: 'Курс', description: 'Описание' }).expect(403);
  await db.user.create({
    data: {
      id: 'other-teacher',
      name: 'Другой',
      email: 'other@study.local',
      passwordHash: 'disabled',
      role: 'teacher',
    },
  });
  await db.course.create({
    data: {
      id: 'other-course',
      title: 'Чужой',
      description: 'Описание',
      teacherId: 'other-teacher',
    },
  });
  await teacher
    .patch('/api/courses/other-course')
    .send({ title: 'Новый', description: 'Текст' })
    .expect(403);
  await teacher.delete('/api/courses/other-course').expect(403);
  await teacher.delete('/api/courses/missing').expect(404);
  await teacher.post('/api/courses').send({ title: '', description: 'Описание' }).expect(400);
});
it('T9 T10 T12 создаёт задание с настоящим скачиваемым файлом', async () => {
  const file = await upload(teacher, 'Условие.txt', Buffer.from('Условие задания'));
  const response = await teacher
    .post('/api/courses/demo-course/assignments')
    .send({
      title: 'Новое задание',
      description: 'Решить задачу',
      criteria: 'Верность',
      deadline: new Date(Date.now() + 86400000).toISOString(),
      attachmentId: file.id,
    })
    .expect(201);
  expect(
    (await student.get('/api/assignments/' + response.body.id).expect(200)).body.attachment.name,
  ).toBe('Условие.txt');
  const download = await student.get('/api/files/' + file.id).expect(200);
  expect(download.body.toString()).toBe('Условие задания');
  expect(download.headers['content-disposition']).toContain('attachment');
});
it.each(['', 'wrong-date', '2020-01-01'])('T9 проверяет срок задания %s', async (deadline) => {
  await teacher
    .post('/api/courses/demo-course/assignments')
    .send({ title: 'Задание', description: 'Условие', deadline })
    .expect(400);
});
it('T9 проверяет принадлежность файла задания', async () => {
  const file = await upload();
  await teacher
    .post('/api/courses/demo-course/assignments')
    .send({
      title: 'Задание',
      description: 'Условие',
      deadline: new Date(Date.now() + 86400000).toISOString(),
      attachmentId: file.id,
    })
    .expect(403);
});
it('T10 T11 фильтрует состояния и пустой результат', async () => {
  expect(
    (await student.get('/api/courses/demo-course?status=empty')).body.assignments,
  ).toHaveLength(3);
  const w = await submit();
  expect(
    (await student.get('/api/courses/demo-course?status=submitted')).body.assignments,
  ).toHaveLength(1);
  expect(
    (await student.get('/api/courses/demo-course?status=reviewed')).body.assignments,
  ).toHaveLength(0);
  await teacher.post(`/api/works/${w.id}/review`).send(review).expect(200);
  expect(
    (await student.get('/api/courses/demo-course?status=reviewed')).body.assignments,
  ).toHaveLength(1);
  await student.get('/api/courses/demo-course?status=unknown').expect(400);
  await student.get('/api/assignments/missing').expect(404);
});
it('T12 сохраняет байты под уникальными именами', async () => {
  const a = await upload();
  const b = await upload();
  const rows = await db.storedFile.findMany();
  expect(new Set(rows.map((f) => f.storageKey)).size).toBe(2);
  expect(a.id).not.toBe(b.id);
  const stored = rows.find((f) => f.id === a.id)!;
  expect((await readFile(path.join(dir, stored.storageKey))).toString()).toBe('Учебная работа');
  expect((await student.get('/api/files/' + a.id)).body.toString()).toBe('Учебная работа');
});
it('T12 запрещает неверные файлы, пустые и превышающие лимит', async () => {
  for (const [name, buffer] of [
    ['a.exe', Buffer.from('abc')],
    ['a.pdf', Buffer.from('fake')],
    ['a.txt', Buffer.alloc(0)],
  ] as const)
    await student
      .post('/api/files')
      .set('Content-Type', 'application/octet-stream')
      .set('X-File-Name', name)
      .send(buffer)
      .expect(400);
  await student
    .post('/api/files')
    .set('Content-Type', 'application/octet-stream')
    .set('X-File-Name', 'a.txt')
    .send(Buffer.alloc(5 * 1024 * 1024 + 1, 65))
    .expect(413);
  await admin
    .post('/api/files')
    .set('Content-Type', 'application/octet-stream')
    .set('X-File-Name', 'a.txt')
    .send(Buffer.from('abc'))
    .expect(403);
});
it('T2 T12 ограничивает выдачу файла и обрабатывает отсутствие', async () => {
  const f = await upload();
  await teacher.get('/api/files/' + f.id).expect(403);
  await student.get('/api/files/missing').expect(404);
  const row = await db.storedFile.findUniqueOrThrow({ where: { id: f.id } });
  await unlink(path.join(dir, row.storageKey));
  await student.get('/api/files/' + f.id).expect(404);
});
it('T13 T14 T15 отправляет работу и показывает своему преподавателю', async () => {
  const w = await submit();
  expect((await student.get('/api/works/' + w.id)).body.status).toBe('submitted');
  expect((await teacher.get('/api/works')).body.map((x: { id: string }) => x.id)).toContain(w.id);
  await student.get('/api/works').expect(403);
  await admin.get('/api/works/' + w.id).expect(403);
  await teacher.get('/api/files/' + w.fileId).expect(200);
});
it('T13 запрещает повторную отправку и повторное использование файла', async () => {
  const w = await submit();
  await student.post('/api/assignments/demo-release/submit').send({ fileId: w.fileId }).expect(409);
  const fresh = await upload();
  await student.post('/api/assignments/demo-testing/submit').send({ fileId: fresh.id }).expect(409);
});
it('T13 проверяет срок, задание и принадлежность файла', async () => {
  await student.post('/api/assignments/missing/submit').send({ fileId: 'missing' }).expect(404);
  await student.post('/api/assignments/demo-testing/submit').send({}).expect(400);
  await student
    .post('/api/assignments/demo-testing/submit')
    .send({ fileId: 'missing' })
    .expect(403);
  await db.assignment.update({ where: { id: 'demo-testing' }, data: { deadline: new Date(0) } });
  await student.post('/api/assignments/demo-testing/submit').send({ fileId: 'x' }).expect(409);
});
it('T16 T17 T18 T19 сохраняет рецензию, историю и прочтение уведомления', async () => {
  const w = await submit();
  await teacher.post(`/api/works/${w.id}/review`).send(review).expect(200);
  const history = (await student.get('/api/history').expect(200)).body;
  expect(history[0]).toMatchObject({ ...review, id: w.id, status: 'reviewed' });
  expect(history[0].reviewedAt).toBeTruthy();
  expect((await teacher.get('/api/works')).body).toHaveLength(0);
  const notices = (await student.get('/api/notifications')).body;
  expect(notices[0].readAt).toBeNull();
  await student.patch(`/api/notifications/${notices[0].id}/read`).expect(200);
  expect((await student.get('/api/notifications')).body[0].readAt).toBeTruthy();
  await student.patch('/api/notifications/missing/read').expect(404);
  await teacher.get('/api/history').expect(403);
  await teacher.get('/api/notifications').expect(403);
  expect(await db.auditEvent.count({ where: { action: 'work.reviewed' } })).toBe(1);
});
it('T16 T18 отклоняет работу без оценки и уведомляет', async () => {
  const w = await submit();
  await teacher.post(`/api/works/${w.id}/reject`).send({ reason: 'Нет решения' }).expect(200);
  expect((await student.get('/api/works/' + w.id)).body).toMatchObject({
    status: 'rejected',
    grade: null,
    comment: 'Нет решения',
  });
  expect((await student.get('/api/notifications')).body[0].message).toBe('Работа отклонена');
});
it('T16 защищает оценку и обязательные поля', async () => {
  const w = await submit();
  await student.post(`/api/works/${w.id}/review`).send(review).expect(403);
  for (const grade of [-1, 101, 1.5, null])
    await teacher
      .post(`/api/works/${w.id}/review`)
      .send({ ...review, grade })
      .expect(400);
  await teacher
    .post(`/api/works/${w.id}/review`)
    .send({ ...review, comment: '' })
    .expect(400);
  await teacher.post(`/api/works/${w.id}/reject`).send({ reason: '' }).expect(400);
});
it('T2 T19 студент не видит чужую работу, файл и уведомление', async () => {
  const w = await submit();
  await teacher.post(`/api/works/${w.id}/review`).send(review);
  const notice = await db.notification.findFirstOrThrow();
  const outsider = request.agent(app);
  await outsider
    .post('/api/auth/register')
    .send({ name: 'Другой студент', email: 'outsider@study.local', password: 'Password123!' })
    .expect(201);
  await outsider.get('/api/works/' + w.id).expect(403);
  await outsider.get('/api/files/' + w.fileId).expect(403);
  await outsider.patch(`/api/notifications/${notice.id}/read`).expect(404);
  expect((await outsider.get('/api/history')).body).toEqual([]);
});
it('T5 удаляет курс вместе с работами, уведомлениями и файлами', async () => {
  const w = await submit();
  await teacher.post(`/api/works/${w.id}/review`).send(review);
  await teacher.delete('/api/courses/demo-course').expect(200);
  expect(await db.work.count()).toBe(0);
  expect(await db.notification.count()).toBe(0);
  expect(await db.assignment.count()).toBe(0);
  expect(await db.storedFile.count()).toBe(0);
  await student.get('/api/files/' + w.fileId).expect(404);
});
it('T20 блокирует пользователя и завершает его сеансы', async () => {
  await student.get('/api/users').expect(403);
  await teacher.get('/api/users').expect(403);
  expect((await admin.get('/api/users')).body).toHaveLength(3);
  await admin.patch('/api/users/demo-student').send({ role: 'student', blocked: true }).expect(200);
  await student.get('/api/auth/me').expect(401);
  await student
    .post('/api/auth/login')
    .send({ email: 'student@study.local', password: 'Study2026!' })
    .expect(401);
  await admin
    .patch('/api/users/demo-student')
    .send({ role: 'student', blocked: false })
    .expect(200);
  await student
    .post('/api/auth/login')
    .send({ email: 'student@study.local', password: 'Study2026!' })
    .expect(200);
});
it('T20 назначает роль и запрещает опасные изменения', async () => {
  await admin
    .patch('/api/users/demo-student')
    .send({ role: 'teacher', blocked: false })
    .expect(200);
  await student.get('/api/auth/me').expect(401);
  await admin.patch('/api/users/demo-admin').send({ role: 'student', blocked: true }).expect(409);
  await admin
    .patch('/api/users/demo-teacher')
    .send({ role: 'student', blocked: false })
    .expect(409);
  await admin.patch('/api/users/missing').send({ role: 'student', blocked: false }).expect(404);
  await admin.patch('/api/users/demo-student').send({ role: 'owner', blocked: false }).expect(400);
});
it('T20 сохраняет роль студента с работами и ограничивает журнал', async () => {
  await submit();
  await admin
    .patch('/api/users/demo-student')
    .send({ role: 'teacher', blocked: false })
    .expect(409);
  await student.get('/api/audit').expect(403);
  expect((await admin.get('/api/audit').expect(200)).body[0].action).toBe('work.submit');
});
it('T1 блокирует перебор входа', async () => {
  const isolated = createReleaseApp(db, dir);
  for (let i = 0; i < 30; i++) await request(isolated).post('/api/auth/login').send({}).expect(400);
  await request(isolated).post('/api/auth/login').send({}).expect(429);
});
it('T1 logout аннулирует сохранённый токен', async () => {
  const r = await request(app)
    .post('/api/auth/login')
    .send({ email: 'student@study.local', password: 'Study2026!' })
    .expect(200);
  const cookie = String(r.headers['set-cookie']).split(';')[0]!;
  const token = cookie.split('=')[1]!;
  expect(await db.session.findUnique({ where: { tokenHash: tokenHash(token) } })).not.toBeNull();
  await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
  await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
});
