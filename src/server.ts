import { PrismaClient } from '@prisma/client';
import { createReleaseApp } from './release/app.js';
import path from 'node:path';

const db = new PrismaClient();
const app = createReleaseApp(db, path.resolve(process.env.FILE_STORAGE_DIR ?? 'data/files'));
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`Review service: http://localhost:${port}`);
});
const stop = () => server.close(() => void db.$disconnect());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
