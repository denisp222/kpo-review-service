import express, { type ErrorRequestHandler, type Response } from 'express';
import { Prisma, PrismaClient, type User } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../reviews/types.js';
import { ReviewService } from '../reviews/service.js';
import { PrismaRepository } from '../infrastructure/prisma-repository.js';
import {
  email,
  password,
  hashPassword,
  verifyPassword,
  tokenHash,
  text,
  fileName,
  fileContent,
} from './security.js';

export const publicUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  blocked: true,
  createdAt: true,
} as const;
const safeUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  blocked: u.blocked,
});
const who = (res: Response) => res.locals.user as User;
function role(res: Response, expected: User['role']) {
  const user = who(res);
  if (user.role !== expected) throw new AppError(403, 'Недостаточно прав');
  return user;
}
const cookieToken = (value: string | undefined) =>
  value
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('session='))
    ?.slice(8) ?? '';
export function createReleaseApp(
  db: PrismaClient,
  storageDir: string,
  webDir = path.resolve('web/dist'),
) {
  mkdirSync(storageDir, { recursive: true });
  const app = express();
  const reviews = new ReviewService(new PrismaRepository(db));
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== `${req.protocol}://${req.get('host')}`
    )
      return next(new AppError(403, 'Запрос с другого сайта запрещён'));
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.use('/api/auth', (req, _res, next) => {
    if (!['/login', '/register'].includes(req.path)) return next();
    const key = req.ip ?? 'local';
    const now = Date.now();
    for (const [ip, value] of attempts) if (value.until < now) attempts.delete(ip);
    const value = attempts.get(key) ?? { count: 0, until: now + 15 * 60000 };
    value.count++;
    attempts.set(key, value);
    if (value.count > 30 || attempts.size > 5000)
      return next(new AppError(429, 'Слишком много попыток. Повторите через 15 минут'));
    next();
  });
  async function session(user: User, res: Response) {
    const token = randomBytes(32).toString('hex');
    await db.session.create({
      data: {
        tokenHash: tokenHash(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400000,
      path: '/',
    });
    return safeUser(user);
  }
  app.post('/api/auth/register', async (req, res) => {
    if (req.body?.role && req.body.role !== 'student')
      throw new AppError(400, 'Регистрация создаёт учётную запись студента');
    const data = {
      name: text(req.body?.name, 'Имя', 100, 2),
      email: email(req.body?.email),
      passwordHash: await hashPassword(password(req.body?.password)),
    };
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({ data });
      await tx.auditEvent.create({
        data: {
          actorId: created.id,
          action: 'register',
          targetId: created.id,
          description: 'Регистрация студента',
        },
      });
      return created;
    });
    res.status(201).json(await session(user, res));
  });
  app.post('/api/auth/login', async (req, res) => {
    const address = email(req.body?.email);
    const secret = password(req.body?.password);
    const user = await db.user.findUnique({ where: { email: address } });
    const valid = await verifyPassword(
      secret,
      user?.passwordHash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
    );
    if (!valid || !user || user.blocked)
      throw new AppError(401, 'Неверный email, пароль или учётная запись заблокирована');
    res.json(await session(user, res));
  });
  app.use('/api', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = cookieToken(req.headers.cookie);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'Требуется вход');
    const found = await db.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: true },
    });
    if (!found || found.expiresAt <= new Date() || found.user.blocked)
      throw new AppError(401, 'Сеанс завершён. Войдите снова');
    res.locals.user = found.user;
    res.locals.tokenHash = found.tokenHash;
    next();
  });
  app.get('/api/auth/me', (_req, res) => res.json(safeUser(who(res))));
  app.post('/api/auth/logout', async (_req, res) => {
    await db.session.deleteMany({ where: { tokenHash: res.locals.tokenHash as string } });
    res.clearCookie('session', { path: '/', httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true });
  });
  async function ownCourse(id: string, res: Response) {
    const user = role(res, 'teacher');
    const course = await db.course.findUnique({ where: { id } });
    if (!course) throw new AppError(404, 'Курс не найден');
    if (course.teacherId !== user.id) throw new AppError(403, 'Доступ к чужому курсу запрещён');
    return course;
  }
  async function ownedFile(id: unknown, userId: string) {
    if (typeof id !== 'string') throw new AppError(400, 'Выберите загруженный файл');
    const file = await db.storedFile.findUnique({
      where: { id },
      include: { work: true, assignment: true },
    });
    if (!file || file.ownerId !== userId) throw new AppError(403, 'Нет доступа к файлу');
    if (file.work || file.assignment) throw new AppError(409, 'Файл уже прикреплён');
    return file;
  }
  app.get('/api/courses', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const courses = await db.course.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      courses.filter((course) =>
        course.title.toLocaleLowerCase('ru-RU').includes(q.toLocaleLowerCase('ru-RU')),
      ),
    );
  });
  app.post('/api/courses', async (req, res) => {
    const user = role(res, 'teacher');
    const data = {
      title: text(req.body?.title, 'Название', 150),
      description: text(req.body?.description, 'Описание', 5000),
      teacherId: user.id,
    };
    const course = await db.$transaction(async (tx) => {
      const row = await tx.course.create({ data });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'course.create',
          targetId: row.id,
          description: row.title,
        },
      });
      return row;
    });
    res.status(201).json(course);
  });
  app.patch('/api/courses/:id', async (req, res) => {
    const course = await ownCourse(req.params.id, res);
    const data = {
      title: text(req.body?.title, 'Название', 150),
      description: text(req.body?.description, 'Описание', 5000),
    };
    const [updated] = await db.$transaction([
      db.course.update({ where: { id: course.id }, data }),
      db.auditEvent.create({
        data: {
          actorId: who(res).id,
          action: 'course.update',
          targetId: course.id,
          description: data.title,
        },
      }),
    ]);
    res.json(updated);
  });
  app.delete('/api/courses/:id', async (req, res) => {
    const course = await ownCourse(req.params.id, res);
    const removed = await db.$transaction(async (tx) => {
      const files = await tx.storedFile.findMany({
        where: {
          OR: [
            { assignment: { courseId: course.id } },
            { work: { assignment: { courseId: course.id } } },
          ],
        },
      });
      await tx.course.delete({ where: { id: course.id } });
      await tx.storedFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
      await tx.auditEvent.create({
        data: {
          actorId: who(res).id,
          action: 'course.delete',
          targetId: course.id,
          description: course.title,
        },
      });
      return files;
    });
    await Promise.all(
      removed.map((f) => unlink(path.join(storageDir, f.storageKey)).catch(() => undefined)),
    );
    res.json({ ok: true });
  });
  app.get('/api/courses/:id', async (req, res) => {
    const course = await db.course.findUnique({
      where: { id: req.params.id },
      include: { teacher: { select: { id: true, name: true } } },
    });
    if (!course) throw new AppError(404, 'Курс не найден');
    const assignments = await db.assignment.findMany({
      where: { courseId: course.id },
      include: {
        attachment: { select: { id: true, name: true, size: true } },
        works: { where: { studentId: who(res).id } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    if (!['all', 'empty', 'submitted', 'reviewed', 'rejected'].includes(status))
      throw new AppError(400, 'Неизвестный статус');
    res.json({
      ...course,
      assignments: assignments.filter(
        (a) => status === 'all' || (a.works[0]?.status ?? 'empty') === status,
      ),
    });
  });
  app.post('/api/courses/:id/assignments', async (req, res) => {
    const course = await ownCourse(req.params.id, res);
    const deadline = new Date(text(req.body?.deadline, 'Срок сдачи', 40));
    if (!Number.isFinite(deadline.getTime()) || deadline <= new Date())
      throw new AppError(400, 'Срок сдачи должен быть в будущем');
    const attachment = req.body?.attachmentId
      ? await ownedFile(req.body.attachmentId, who(res).id)
      : null;
    const data = {
      courseId: course.id,
      title: text(req.body?.title, 'Название', 150),
      description: text(req.body?.description, 'Условие', 10000),
      criteria: text(req.body?.criteria ?? '', 'Критерии', 2000, 0),
      deadline,
      attachmentId: attachment?.id,
    };
    const assignment = await db.$transaction(async (tx) => {
      const row = await tx.assignment.create({ data });
      await tx.auditEvent.create({
        data: {
          actorId: who(res).id,
          action: 'assignment.create',
          targetId: row.id,
          description: row.title,
        },
      });
      return row;
    });
    res.status(201).json(assignment);
  });
  app.get('/api/assignments/:id', async (req, res) => {
    const assignment = await db.assignment.findUnique({
      where: { id: req.params.id },
      include: {
        course: { include: { teacher: { select: { name: true } } } },
        attachment: { select: { id: true, name: true, size: true } },
        works: { where: { studentId: who(res).id } },
      },
    });
    if (!assignment) throw new AppError(404, 'Задание не найдено');
    res.json(assignment);
  });
  app.post(
    '/api/files',
    express.raw({ type: 'application/octet-stream', limit: '5mb' }),
    async (req, res) => {
      const user = who(res);
      if (user.role === 'admin')
        throw new AppError(403, 'Загрузка доступна студенту и преподавателю');
      const name = fileName(req.get('x-file-name'));
      const content = fileContent(name, req.body);
      const storageKey = randomUUID();
      const location = path.join(storageDir, storageKey);
      await writeFile(location, content, { flag: 'wx' });
      try {
        const file = await db.storedFile.create({
          data: { name, size: content.length, storageKey, ownerId: user.id },
        });
        res.status(201).json({ id: file.id, name: file.name, size: file.size });
      } catch (error) {
        await unlink(location).catch(() => undefined);
        throw error;
      }
    },
  );
  app.get('/api/files/:id', async (req, res) => {
    const file = await db.storedFile.findUnique({
      where: { id: req.params.id },
      include: { assignment: true, work: true },
    });
    if (!file) throw new AppError(404, 'Файл не найден');
    const user = who(res);
    if (!file.assignment && file.ownerId !== user.id && file.work?.teacherId !== user.id)
      throw new AppError(403, 'Нет доступа к файлу');
    const bytes = await readFile(path.join(storageDir, file.storageKey)).catch(() => {
      throw new AppError(404, 'Файл отсутствует в хранилище');
    });
    res.attachment(file.name).type('application/octet-stream').send(bytes);
  });
  app.post('/api/assignments/:id/submit', async (req, res) => {
    const user = role(res, 'student');
    const assignment = await db.assignment.findUnique({
      where: { id: req.params.id },
      include: { course: true },
    });
    if (!assignment) throw new AppError(404, 'Задание не найдено');
    if (assignment.deadline < new Date()) throw new AppError(409, 'Срок сдачи истёк');
    const file = await ownedFile(req.body?.fileId, user.id);
    const studentComment = text(req.body?.comment ?? '', 'Комментарий', 2000, 0);
    const work = await db.$transaction(async (tx) => {
      const row = await tx.work.create({
        data: {
          id: randomUUID(),
          assignmentId: assignment.id,
          studentId: user.id,
          teacherId: assignment.course.teacherId,
          fileId: file.id,
          studentComment,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'work.submit',
          targetId: row.id,
          description: assignment.title,
        },
      });
      return row;
    });
    res.status(201).json(work);
  });
  const workInclude = {
    assignment: { include: { course: true } },
    student: { select: { id: true, name: true, email: true } },
    file: { select: { id: true, name: true, size: true } },
  } as const;
  app.get('/api/works', async (_req, res) => {
    const user = role(res, 'teacher');
    res.json(
      await db.work.findMany({
        where: { teacherId: user.id, status: 'submitted', assignmentId: { not: null } },
        include: workInclude,
        orderBy: { createdAt: 'asc' },
      }),
    );
  });
  app.get('/api/works/:id', async (req, res) => {
    const user = who(res);
    if (user.role === 'admin') throw new AppError(403, 'Результат доступен участникам работы');
    await reviews.getWork(req.params.id, { id: user.id, role: user.role });
    res.json(await db.work.findUnique({ where: { id: req.params.id }, include: workInclude }));
  });
  app.post('/api/works/:id/review', async (req, res) => {
    const user = role(res, 'teacher');
    res.json(await reviews.review(req.params.id, { id: user.id, role: 'teacher' }, req.body ?? {}));
  });
  app.post('/api/works/:id/reject', async (req, res) => {
    const user = role(res, 'teacher');
    res.json(await reviews.reject(req.params.id, { id: user.id, role: 'teacher' }, req.body ?? {}));
  });
  app.get('/api/history', async (_req, res) => {
    const user = role(res, 'student');
    res.json(
      await db.work.findMany({
        where: { studentId: user.id },
        include: workInclude,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
  app.get('/api/notifications', async (_req, res) => {
    const user = role(res, 'student');
    res.json(
      await db.notification.findMany({
        where: { studentId: user.id },
        include: { work: { select: { assignment: { select: { title: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
  app.patch('/api/notifications/:id/read', async (req, res) => {
    const user = role(res, 'student');
    const result = await db.notification.updateMany({
      where: { id: req.params.id, studentId: user.id },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new AppError(404, 'Уведомление не найдено');
    res.json({ ok: true });
  });
  app.get('/api/users', async (_req, res) => {
    role(res, 'admin');
    res.json(await db.user.findMany({ select: publicUser, orderBy: { createdAt: 'asc' } }));
  });
  app.patch('/api/users/:id', async (req, res) => {
    const user = role(res, 'admin');
    if (user.id === req.params.id) throw new AppError(409, 'Свою роль и блокировку менять нельзя');
    const nextRole = req.body?.role;
    const blocked = req.body?.blocked;
    if (!['student', 'teacher', 'admin'].includes(nextRole) || typeof blocked !== 'boolean')
      throw new AppError(400, 'Укажите корректную роль и состояние блокировки');
    const updated = await db.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id: req.params.id } });
        if (!target) throw new AppError(404, 'Пользователь не найден');
        if (
          target.role === 'admin' &&
          (blocked || nextRole !== 'admin') &&
          (await tx.user.count({ where: { role: 'admin', blocked: false } })) <= 1
        )
          throw new AppError(409, 'Нельзя отключить последнего администратора');
        if (nextRole !== 'teacher' && (await tx.course.count({ where: { teacherId: target.id } })))
          throw new AppError(409, 'У преподавателя есть курсы. Сначала удалите их');
        if (nextRole !== 'student' && (await tx.work.count({ where: { studentId: target.id } })))
          throw new AppError(409, 'У студента есть работы; роль сохраняется для истории');
        const row = await tx.user.update({
          where: { id: target.id },
          data: { role: nextRole, blocked },
          select: publicUser,
        });
        await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            action: 'user.update',
            targetId: target.id,
            description: `${target.email}: ${nextRole}, блокировка ${blocked ? 'да' : 'нет'}`,
          },
        });
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    res.json(updated);
  });
  app.get('/api/audit', async (_req, res) => {
    role(res, 'admin');
    res.json(
      await db.auditEvent.findMany({
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  });
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Маршрут не найден')));
  app.use(express.static(webDir, { index: 'index.html' }));
  app.use((_req, _res, next) => next(new AppError(404, 'Страница не найдена')));
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AppError)
      return void res.status(error.status).json({ error: error.message });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2025', 'P2034'].includes(error.code)
    )
      return void res
        .status(409)
        .json({ error: 'Запись уже существует или была изменена. Обновите страницу' });
    if (error instanceof SyntaxError)
      return void res.status(400).json({ error: 'Некорректный JSON' });
    if (error instanceof Error && 'type' in error && error.type === 'entity.too.large')
      return void res.status(413).json({ error: 'Превышен допустимый размер запроса' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  };
  app.use(onError);
  return app;
}
