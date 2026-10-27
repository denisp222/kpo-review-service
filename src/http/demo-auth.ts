import { timingSafeEqual } from 'node:crypto';
import type { Actor } from '../reviews/types.js';
import type { Authenticate } from './app.js';

export function demoAuth(teacherToken: string, studentToken: string): Authenticate {
  if (teacherToken.length < 24 || studentToken.length < 24 || teacherToken === studentToken) {
    throw new Error('Для демонстрации нужны два разных токена длиной не менее 24 символов');
  }
  const identities: [string, Actor][] = [
    [teacherToken, { id: 'teacher-1', role: 'teacher' }],
    [studentToken, { id: 'student-1', role: 'student' }],
  ];
  return (authorization) => {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    const token = Buffer.from(authorization.slice(7));
    for (const [secret, actor] of identities) {
      const expected = Buffer.from(secret);
      if (token.length === expected.length && timingSafeEqual(token, expected)) return actor;
    }
    return undefined;
  };
}
