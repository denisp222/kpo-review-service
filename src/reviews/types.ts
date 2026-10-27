export type Role = 'student' | 'teacher' | 'admin';
export type WorkStatus = 'submitted' | 'reviewed' | 'rejected';

export interface Actor {
  id: string;
  role: Role;
}

export interface Work {
  id: string;
  studentId: string;
  teacherId: string;
  status: WorkStatus;
  grade: number | null;
  comment: string | null;
  recommendations: string | null;
}

export interface Decision {
  status: 'reviewed' | 'rejected';
  grade: number | null;
  comment: string;
  recommendations: string | null;
}

export interface Notification {
  id: string;
  studentId: string;
  workId: string;
  message: string;
}

export interface IReviewRepo {
  findWork(id: string): Promise<Work | null>;
  saveDecision(id: string, decision: Decision): Promise<Work | null>;
}

export interface INotificationRepo {
  listForStudent(studentId: string): Promise<Notification[]>;
}

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
