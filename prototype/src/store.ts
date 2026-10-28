import { ReviewService } from '../../src/reviews/service.js';
import {
  AppError,
  type Actor,
  type Decision,
  type IReviewRepo,
  type Notification,
  type Work,
} from '../../src/reviews/types.js';

export const student: Actor = { id: 'student-1', role: 'student' };
export const teacher: Actor = { id: 'teacher-1', role: 'teacher' };
export const assignments = [
  {
    id: 'task-1',
    number: '01',
    title: 'Описание требований к системе',
    due: '02.11.2026',
    description:
      'Определите пользователей системы, основные функции и критерии готовности. Оформите результат в одном файле.',
    criteria: [
      'Сформулирована цель системы',
      'Определены роли и основные функции',
      'Для каждой функции указан проверяемый результат',
    ],
  },
  {
    id: 'task-2',
    number: '02',
    title: 'Модель данных проекта',
    due: '05.11.2026',
    description:
      'Подготовьте модель данных: пользователи, курсы, задания, работы и рецензии. Покажите связи и ограничения.',
    criteria: [
      'Выделены основные сущности',
      'Указаны связи между сущностями',
      'Определены обязательные поля',
    ],
  },
  {
    id: 'task-3',
    number: '03',
    title: 'Тестирование модуля',
    due: '09.11.2026',
    description:
      'Опишите модульные и интеграционные проверки. Приложите результат запуска и объясните выбранные сценарии.',
    criteria: [
      'Проверены корректные и ошибочные данные',
      'Описаны ожидаемые результаты',
      'Приведён результат запуска тестов',
    ],
  },
] as const;
export type FileInfo = { name: string; size: number };
export type DemoWork = Work & {
  assignmentId: string;
  file: FileInfo;
  submissionComment: string;
  submittedAt: string;
  reviewedAt: string | null;
};
export type DemoNotification = Notification & { read: boolean; createdAt: string };
export type State = { schema: 1; works: DemoWork[]; notifications: DemoNotification[] };
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
const key = 'kpo-lab6-prototype-v1';

export function initialState(): State {
  return {
    schema: 1,
    works: [
      {
        id: 'example-pending',
        assignmentId: 'task-2',
        studentId: student.id,
        teacherId: teacher.id,
        status: 'submitted',
        grade: null,
        comment: null,
        recommendations: null,
        file: { name: 'Модель данных.pdf', size: 185000 },
        submissionComment: 'Добавлены связи заданий, работ и рецензий.',
        submittedAt: '2026-10-27T10:15:00.000Z',
        reviewedAt: null,
      },
      {
        id: 'example-reviewed',
        assignmentId: 'task-3',
        studentId: student.id,
        teacherId: teacher.id,
        status: 'reviewed',
        grade: 92,
        comment: 'Основные сценарии проверены. Результаты приведены понятно.',
        recommendations: 'Добавить проверку одновременных запросов.',
        file: { name: 'Результаты тестирования.pdf', size: 214000 },
        submissionComment: 'Приложены сценарии и результаты.',
        submittedAt: '2026-10-26T08:30:00.000Z',
        reviewedAt: '2026-10-27T07:00:00.000Z',
      },
    ],
    notifications: [],
  };
}

function validSaved(value: unknown): value is State {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schema' in value) ||
    value.schema !== 1 ||
    !('works' in value) ||
    !Array.isArray(value.works) ||
    !('notifications' in value) ||
    !Array.isArray(value.notifications)
  )
    return false;
  return (
    value.works.every(
      (w: DemoWork) =>
        w &&
        typeof w.id === 'string' &&
        assignments.some((a) => a.id === w.assignmentId) &&
        ['submitted', 'reviewed', 'rejected'].includes(w.status) &&
        w.file &&
        typeof w.file.name === 'string',
    ) &&
    value.notifications.every(
      (n: DemoNotification) =>
        n &&
        typeof n.id === 'string' &&
        typeof n.message === 'string' &&
        typeof n.read === 'boolean',
    )
  );
}

export class PrototypeStore implements IReviewRepo {
  private state: State = initialState();
  private listeners = new Set<() => void>();
  readonly reviews = new ReviewService(this);
  constructor(
    private storage?: StorageLike,
    private now = () => new Date().toISOString(),
  ) {
    try {
      const saved = storage?.getItem(key);
      if (saved) {
        const value: unknown = JSON.parse(saved);
        if (validSaved(value)) this.state = value;
      }
    } catch {
      this.storage = undefined;
    }
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private commit(state: State) {
    try {
      this.storage?.setItem(key, JSON.stringify(state));
    } catch {
      throw new AppError(
        400,
        'Браузер не смог сохранить данные. Освободите место или начните демонстрацию заново.',
      );
    }
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  reset() {
    this.commit(initialState());
  }
  async findWork(id: string): Promise<DemoWork | null> {
    return this.state.works.find((work) => work.id === id) ?? null;
  }
  workForAssignment(assignmentId: string) {
    return this.state.works.find(
      (work) => work.assignmentId === assignmentId && work.studentId === student.id,
    );
  }
  submit(assignmentId: string, actor: Actor, file: FileInfo | null, submissionComment: string) {
    if (actor.role !== 'student' || actor.id !== student.id)
      throw new AppError(403, 'Отправка доступна студенту');
    if (!assignments.some((a) => a.id === assignmentId))
      throw new AppError(404, 'Задание не найдено');
    if (this.workForAssignment(assignmentId))
      throw new AppError(409, 'Работа по этому заданию уже отправлена');
    if (!file) throw new AppError(400, 'Выберите файл работы');
    if (!/\.(pdf|docx|txt|zip)$/i.test(file.name))
      throw new AppError(400, 'Допустимы файлы PDF, DOCX, TXT и ZIP');
    if (file.size <= 0 || file.size > 5 * 1024 * 1024)
      throw new AppError(400, 'Размер файла должен быть больше 0 и не превышать 5 МБ');
    if (submissionComment.trim().length > 2000)
      throw new AppError(400, 'Комментарий не должен превышать 2000 символов');
    const work: DemoWork = {
      id: `submission-${assignmentId}`,
      assignmentId,
      studentId: actor.id,
      teacherId: teacher.id,
      status: 'submitted',
      grade: null,
      comment: null,
      recommendations: null,
      file: { ...file },
      submissionComment: submissionComment.trim(),
      submittedAt: this.now(),
      reviewedAt: null,
    };
    this.commit({ ...this.state, works: [...this.state.works, work] });
    return work;
  }
  async saveDecision(id: string, decision: Decision): Promise<DemoWork | null> {
    const work = this.state.works.find((item) => item.id === id);
    if (!work || work.status !== 'submitted') return null;
    const reviewed = { ...work, ...decision, reviewedAt: this.now() };
    const title = assignments.find((a) => a.id === work.assignmentId)?.title ?? 'Учебная работа';
    const notification: DemoNotification = {
      id: `notification-${id}`,
      studentId: work.studentId,
      workId: id,
      read: false,
      createdAt: this.now(),
      message:
        decision.status === 'reviewed'
          ? `«${title}»: выставлена оценка ${decision.grade} из 100.`
          : `«${title}»: работа отклонена. Откройте результат проверки.`,
    };
    this.commit({
      ...this.state,
      works: this.state.works.map((item) => (item.id === id ? reviewed : item)),
      notifications: [notification, ...this.state.notifications],
    });
    return reviewed;
  }
  markRead(id: string) {
    this.commit({
      ...this.state,
      notifications: this.state.notifications.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      ),
    });
  }
}
