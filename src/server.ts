import { PrismaClient } from '@prisma/client';
import { createApp } from './http/app.js';
import { demoAuth } from './http/demo-auth.js';
import { PrismaRepository } from './infrastructure/prisma-repository.js';
import { ReviewService } from './reviews/service.js';

const db = new PrismaClient();
const repository = new PrismaRepository(db);
const authenticate = demoAuth(process.env.TEACHER_TOKEN ?? '', process.env.STUDENT_TOKEN ?? '');
const app = createApp(new ReviewService(repository), repository, authenticate);
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`Review service: http://localhost:${port}`);
});
const stop = () => server.close(() => void db.$disconnect());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
