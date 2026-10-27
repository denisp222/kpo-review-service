import { PrismaClient } from '@prisma/client';
import type {
  Decision,
  INotificationRepo,
  IReviewRepo,
  Notification,
  Work,
} from '../reviews/types.js';

export class PrismaRepository implements IReviewRepo, INotificationRepo {
  constructor(private readonly db: PrismaClient) {}

  findWork(id: string): Promise<Work | null> {
    return this.db.work.findUnique({ where: { id } });
  }

  saveDecision(id: string, decision: Decision): Promise<Work | null> {
    return this.db.$transaction(async (tx) => {
      const result = await tx.work.updateMany({
        where: { id, status: 'submitted' },
        data: decision,
      });
      if (result.count === 0) return null;
      const work = await tx.work.findUniqueOrThrow({ where: { id } });
      await tx.notification.create({
        data: {
          studentId: work.studentId,
          workId: id,
          message: decision.status === 'reviewed' ? 'Работа проверена' : 'Работа отклонена',
        },
      });
      return work;
    });
  }

  listForStudent(studentId: string): Promise<Notification[]> {
    return this.db.notification.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
  }
}
