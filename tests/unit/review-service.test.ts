import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewService } from '../../src/reviews/service.js';
import type { Actor, IReviewRepo, Work } from '../../src/reviews/types.js';

const teacher: Actor = { id: 'teacher-1', role: 'teacher' };
const student: Actor = { id: 'student-1', role: 'student' };
const work: Work = {
  id: 'work-1',
  studentId: student.id,
  teacherId: teacher.id,
  status: 'submitted',
  grade: null,
  comment: null,
  recommendations: null,
};
const input = { grade: 80, comment: 'Хорошо', recommendations: 'Добавить примеры' };

describe('Проверка учебной работы', () => {
  const repo = {
    findWork: vi.fn<IReviewRepo['findWork']>(),
    saveDecision: vi.fn<IReviewRepo['saveDecision']>(),
  };
  const service = new ReviewService(repo);
  beforeEach(() => {
    vi.resetAllMocks();
    repo.findWork.mockResolvedValue({ ...work });
    repo.saveDecision.mockImplementation(async (_id, decision) => ({ ...work, ...decision }));
  });

  it.each([teacher, student])('владелец может прочитать работу: $role', async (actor) => {
    expect(await service.getWork(work.id, actor)).toEqual(work);
  });
  it.each<Actor>([
    { id: 'student-2', role: 'student' },
    { id: 'teacher-2', role: 'teacher' },
    { id: 'admin', role: 'admin' },
  ])('посторонний не читает работу: $id', async (actor) => {
    await expect(service.getWork(work.id, actor)).rejects.toMatchObject({ status: 403 });
  });
  it('отсутствующая работа возвращает 404', async () => {
    repo.findWork.mockResolvedValue(null);
    await expect(service.getWork('missing', teacher)).rejects.toMatchObject({ status: 404 });
  });
  it.each([0, 100])('сохраняет граничную оценку %i и убирает пробелы', async (grade) => {
    const result = await service.review(work.id, teacher, {
      grade,
      comment: ' Хорошо ',
      recommendations: ' Примеры ',
    });
    expect(result).toMatchObject({
      status: 'reviewed',
      grade,
      comment: 'Хорошо',
      recommendations: 'Примеры',
    });
  });
  it.each([-1, 101, 1.5, '80', undefined])('отклоняет неверную оценку %s', async (grade) => {
    await expect(service.review(work.id, teacher, { ...input, grade })).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.saveDecision).not.toHaveBeenCalled();
  });
  it.each([
    ['comment', ''],
    ['comment', '   '],
    ['comment', 7],
    ['recommendations', 'x'.repeat(2001)],
  ])('проверяет текстовое поле %s', async (field, value) => {
    await expect(
      service.review(work.id, teacher, { ...input, [field as string]: value }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('принимает текст длиной 2000 символов', async () => {
    await expect(
      service.review(work.id, teacher, { ...input, comment: 'x'.repeat(2000) }),
    ).resolves.toMatchObject({ grade: 80 });
  });
  it('студент не может поставить оценку', async () => {
    await expect(service.review(work.id, student, input)).rejects.toMatchObject({ status: 403 });
    expect(repo.saveDecision).not.toHaveBeenCalled();
  });
  it.each(['reviewed', 'rejected'] as const)('не меняет итоговое состояние %s', async (status) => {
    repo.findWork.mockResolvedValue({ ...work, status });
    await expect(service.review(work.id, teacher, input)).rejects.toMatchObject({ status: 409 });
    await expect(service.reject(work.id, teacher, { reason: 'Ошибка' })).rejects.toMatchObject({
      status: 409,
    });
  });
  it('отклонение не содержит оценки', async () => {
    expect(await service.reject(work.id, teacher, { reason: ' Нет файла ' })).toMatchObject({
      status: 'rejected',
      grade: null,
      comment: 'Нет файла',
      recommendations: null,
    });
  });
  it('студент не может отклонить работу', async () => {
    await expect(service.reject(work.id, student, { reason: 'Ошибка' })).rejects.toMatchObject({
      status: 403,
    });
  });
  it('отклонение требует причину', async () => {
    await expect(service.reject(work.id, teacher, {})).rejects.toMatchObject({ status: 400 });
  });
  it('возвращает конфликт при одновременном изменении', async () => {
    repo.saveDecision.mockResolvedValue(null);
    await expect(service.review(work.id, teacher, input)).rejects.toMatchObject({ status: 409 });
  });
});
