import { AppError, type Actor, type Decision, type IReviewRepo, type Work } from './types.js';

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000) {
    throw new AppError(400, `${field}: требуется текст длиной от 1 до 2000 символов`);
  }
  return value.trim();
}

export class ReviewService {
  constructor(private readonly reviews: IReviewRepo) {}

  async getWork(id: string, actor: Actor): Promise<Work> {
    const work = await this.reviews.findWork(id);
    if (!work) throw new AppError(404, 'Работа не найдена');
    const studentOwns = actor.role === 'student' && actor.id === work.studentId;
    const teacherOwns = actor.role === 'teacher' && actor.id === work.teacherId;
    if (!studentOwns && !teacherOwns) throw new AppError(403, 'Доступ к работе запрещён');
    return work;
  }

  async review(id: string, actor: Actor, input: Record<string, unknown>): Promise<Work> {
    if (actor.role !== 'teacher') throw new AppError(403, 'Проверка доступна преподавателю');
    const work = await this.getWork(id, actor);
    if (work.status !== 'submitted') throw new AppError(409, 'Работа уже проверена');
    const grade = input.grade;
    if (typeof grade !== 'number' || !Number.isInteger(grade) || grade < 0 || grade > 100) {
      throw new AppError(400, 'Оценка должна быть целым числом от 0 до 100');
    }
    return this.save(id, {
      status: 'reviewed',
      grade,
      comment: requiredText(input.comment, 'Комментарий'),
      recommendations: requiredText(input.recommendations, 'Рекомендации'),
    });
  }

  async reject(id: string, actor: Actor, input: Record<string, unknown>): Promise<Work> {
    if (actor.role !== 'teacher') throw new AppError(403, 'Отклонение доступно преподавателю');
    const work = await this.getWork(id, actor);
    if (work.status !== 'submitted') throw new AppError(409, 'Работа уже проверена');
    return this.save(id, {
      status: 'rejected',
      grade: null,
      comment: requiredText(input.reason, 'Причина отклонения'),
      recommendations: null,
    });
  }

  private async save(id: string, decision: Decision): Promise<Work> {
    const result = await this.reviews.saveDecision(id, decision);
    if (!result) throw new AppError(409, 'Работа уже изменена другим запросом');
    return result;
  }
}
