import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../src/release/seed.js';

const db = new PrismaClient();
try {
  await seedDemo(db);
  console.log('Учебные пользователи и курс готовы. Учётные записи описаны в README.');
} finally {
  await db.$disconnect();
}
