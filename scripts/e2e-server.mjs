import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../dist/release/seed.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Browser tests require a dedicated *_test database');
process.env.DATABASE_URL = url;
process.env.PORT = '3188';
process.env.HOST = '127.0.0.1';
process.env.FILE_STORAGE_DIR = 'data/e2e-files';
const db = new PrismaClient({ datasources: { db: { url } } });
try {
  await db.notification.deleteMany();
  await db.work.deleteMany();
  await db.assignment.deleteMany();
  await db.course.deleteMany();
  await db.storedFile.deleteMany();
  await db.auditEvent.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await seedDemo(db);
} finally {
  await db.$disconnect();
}
await import('../dist/server.js');
