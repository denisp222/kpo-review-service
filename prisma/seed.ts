import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
try {
  await db.work.upsert({
    where: { id: 'work-1' },
    create: { id: 'work-1', studentId: 'student-1', teacherId: 'teacher-1' },
    update: {},
  });
  console.log('Демонстрационная работа: work-1');
} finally {
  await db.$disconnect();
}
