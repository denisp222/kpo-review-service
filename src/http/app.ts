import express, { type ErrorRequestHandler } from 'express';
import { ReviewService } from '../reviews/service.js';
import { AppError, type Actor, type INotificationRepo } from '../reviews/types.js';

export type Authenticate = (authorization: string | undefined) => Actor | undefined;

export function createApp(
  reviews: ReviewService,
  notifications: INotificationRepo,
  authenticate: Authenticate,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api', (req, res, next) => {
    const actor = authenticate(req.headers.authorization);
    if (!actor) throw new AppError(401, 'Требуется авторизация');
    res.locals.actor = actor;
    next();
  });
  app.get('/api/works/:id', async (req, res) => {
    res.json(await reviews.getWork(req.params.id, res.locals.actor as Actor));
  });
  app.post('/api/works/:id/review', async (req, res) => {
    res.json(await reviews.review(req.params.id, res.locals.actor as Actor, req.body ?? {}));
  });
  app.post('/api/works/:id/reject', async (req, res) => {
    res.json(await reviews.reject(req.params.id, res.locals.actor as Actor, req.body ?? {}));
  });
  app.get('/api/notifications', async (_req, res) => {
    const actor = res.locals.actor as Actor;
    if (actor.role !== 'student') throw new AppError(403, 'Уведомления доступны студенту');
    res.json(await notifications.listForStudent(actor.id));
  });
  app.use((_req, _res, next) => next(new AppError(404, 'Маршрут не найден')));
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.message });
    } else if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'Некорректный JSON' });
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Тело запроса превышает 16 КБ' });
    } else {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  };
  app.use(onError);
  return app;
}
