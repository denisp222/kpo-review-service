import { describe, expect, it, vi } from 'vitest';
import { PrototypeStore, student, teacher, type StorageLike } from '../../prototype/src/store.js';

const file = { name: 'Решение.pdf', size: 1500 };
const review = {
  grade: 85,
  comment: 'Требования сформулированы',
  recommendations: 'Уточнить критерии',
};
function memory(): StorageLike {
  let saved: string | null = null;
  return {
    getItem: () => saved,
    setItem: (_key, value) => {
      saved = value;
    },
  };
}

describe('Хранилище автономного прототипа', () => {
  it('отправляет работу студента и сохраняет её после повторного открытия', () => {
    const storage = memory();
    const store = new PrototypeStore(storage);
    const work = store.submit('task-1', student, file, ' Решение приложено ');
    expect(work).toMatchObject({
      status: 'submitted',
      submissionComment: 'Решение приложено',
      grade: null,
    });
    expect(new PrototypeStore(storage).workForAssignment('task-1')).toEqual(work);
  });
  it('не разрешает преподавателю отправлять работу за студента', () => {
    expect(() => new PrototypeStore().submit('task-1', teacher, file, '')).toThrow(
      'Отправка доступна студенту',
    );
  });
  it('не принимает неизвестное задание', () => {
    expect(() => new PrototypeStore().submit('missing', student, file, '')).toThrow(
      'Задание не найдено',
    );
  });
  it('требует выбрать файл', () => {
    expect(() => new PrototypeStore().submit('task-1', student, null, '')).toThrow('Выберите файл');
  });
  it.each(['program.exe', 'page.html'])('не принимает формат %s', (name) => {
    expect(() => new PrototypeStore().submit('task-1', student, { ...file, name }, '')).toThrow(
      'Допустимы файлы',
    );
  });
  it.each([0, 5 * 1024 * 1024 + 1])('отклоняет размер %i', (size) => {
    expect(() => new PrototypeStore().submit('task-1', student, { ...file, size }, '')).toThrow(
      'Размер файла',
    );
  });
  it('принимает верхнюю границу размера и расширение в верхнем регистре', () => {
    expect(
      new PrototypeStore().submit(
        'task-1',
        student,
        { name: 'РАБОТА.PDF', size: 5 * 1024 * 1024 },
        '',
      ).status,
    ).toBe('submitted');
  });
  it('ограничивает длину комментария', () => {
    expect(() => new PrototypeStore().submit('task-1', student, file, 'x'.repeat(2001))).toThrow(
      '2000',
    );
  });
  it('не создаёт повторную отправку', () => {
    const store = new PrototypeStore();
    store.submit('task-1', student, file, '');
    expect(() => store.submit('task-1', student, file, '')).toThrow('уже отправлена');
  });
  it('сохраняет оценку, рекомендации и непрочитанное уведомление вместе', async () => {
    const storage = memory();
    const store = new PrototypeStore(storage, () => '2026-10-28T10:00:00Z');
    const work = store.submit('task-1', student, file, '');
    await store.reviews.review(work.id, teacher, review);
    const restored = new PrototypeStore(storage).getSnapshot();
    expect(restored.works.find((item) => item.id === work.id)).toMatchObject({
      ...review,
      status: 'reviewed',
      reviewedAt: '2026-10-28T10:00:00Z',
    });
    expect(restored.notifications).toEqual([
      expect.objectContaining({
        read: false,
        workId: work.id,
        message: expect.stringContaining('85 из 100'),
      }),
    ]);
  });
  it('сохраняет причину отклонения без оценки', async () => {
    const store = new PrototypeStore();
    const work = store.submit('task-1', student, file, '');
    await store.reviews.reject(work.id, teacher, { reason: 'Нет критериев готовности' });
    expect(await store.findWork(work.id)).toMatchObject({
      status: 'rejected',
      grade: null,
      comment: 'Нет критериев готовности',
    });
    expect(store.getSnapshot().notifications[0]?.message).toContain('отклонена');
  });
  it('не позволяет студенту изменить оценку через переиспользованный сервис', async () => {
    const store = new PrototypeStore();
    const work = store.submit('task-1', student, file, '');
    await expect(store.reviews.review(work.id, student, review)).rejects.toMatchObject({
      status: 403,
    });
    expect(store.getSnapshot().notifications).toHaveLength(0);
  });
  it('повторное решение и неизвестная работа не создают уведомлений', async () => {
    const store = new PrototypeStore();
    expect(
      await store.saveDecision('example-reviewed', { ...review, status: 'reviewed' }),
    ).toBeNull();
    expect(await store.saveDecision('missing', { ...review, status: 'reviewed' })).toBeNull();
    expect(await store.findWork('missing')).toBeNull();
    expect(store.getSnapshot().notifications).toHaveLength(0);
  });
  it('отмечает только выбранное уведомление прочитанным', async () => {
    const store = new PrototypeStore();
    const work = store.submit('task-1', student, file, '');
    await store.reviews.review(work.id, teacher, review);
    await store.reviews.review('example-pending', teacher, review);
    store.markRead(`notification-${work.id}`);
    expect(store.getSnapshot().notifications.find((item) => item.workId === work.id)?.read).toBe(
      true,
    );
    expect(store.getSnapshot().notifications.filter((item) => !item.read)).toHaveLength(1);
  });
  it('ошибка браузерного хранилища не оставляет частично изменённое состояние', async () => {
    const storage = memory();
    const store = new PrototypeStore(storage);
    const work = store.submit('task-1', student, file, '');
    storage.setItem = () => {
      throw new Error('quota');
    };
    await expect(store.reviews.review(work.id, teacher, review)).rejects.toThrow(
      'не смог сохранить',
    );
    expect(store.workForAssignment('task-1')?.status).toBe('submitted');
    expect(store.getSnapshot().notifications).toHaveLength(0);
  });
  it.each(['bad json', '{}', '{"schema":1,"works":[{}],"notifications":[]}'])(
    'повреждённые сохранённые данные не ломают запуск: %s',
    (value) => {
      const store = new PrototypeStore({ getItem: () => value, setItem: () => undefined });
      expect(store.getSnapshot().works).toHaveLength(2);
    },
  );
  it('при запрете чтения хранилища работает в памяти', () => {
    const store = new PrototypeStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(store.submit('task-1', student, file, '').status).toBe('submitted');
  });
  it('уведомляет интерфейс об изменениях и корректно сбрасывает демонстрацию', () => {
    const store = new PrototypeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.submit('task-1', student, file, '');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.reset();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.workForAssignment('task-1')).toBeUndefined();
  });
});
