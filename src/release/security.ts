import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError } from '../reviews/types.js';

const derive = promisify(scrypt);
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function text(value: unknown, label: string, max = 2000, min = 1): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max)
    throw new AppError(400, `${label}: от ${min} до ${max} символов`);
  return value.trim();
}
export function email(value: unknown): string {
  const result = text(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new AppError(400, 'Некорректный email');
  return result;
}
export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128)
    throw new AppError(400, 'Пароль: от 8 до 128 символов');
  return value;
}
export async function hashPassword(value: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(value, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(value: string, stored: string): Promise<boolean> {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [salt, hash] = stored.split(':') as [string, string];
  const actual = (await derive(value, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export function fileName(value: string | undefined): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value ?? '');
  } catch {
    throw new AppError(400, 'Некорректное имя файла');
  }
  const name = text(decoded, 'Имя файла', 180);
  if (
    /[\\/:*?"<>|]/.test(name) ||
    [...name].some((c) => c.charCodeAt(0) < 32) ||
    !/\.(pdf|docx|txt|zip)$/i.test(name)
  )
    throw new AppError(400, 'Разрешены PDF, DOCX, TXT и ZIP с корректным именем');
  return name;
}
export function fileContent(name: string, content: unknown): Buffer {
  if (!Buffer.isBuffer(content) || content.length === 0 || content.length > 5 * 1024 * 1024)
    throw new AppError(400, 'Выберите непустой файл размером до 5 МБ');
  const ext = name.split('.').at(-1)!.toLowerCase();
  if (ext === 'pdf' && content.subarray(0, 5).toString() !== '%PDF-')
    throw new AppError(400, 'Содержимое не соответствует PDF');
  if (
    ['zip', 'docx'].includes(ext) &&
    !['504b0304', '504b0506', '504b0708'].includes(content.subarray(0, 4).toString('hex'))
  )
    throw new AppError(400, 'Содержимое не соответствует ZIP/DOCX');
  if (ext === 'txt') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
      throw new AppError(400, 'TXT должен содержать текст UTF-8');
    }
    if (content.includes(0)) throw new AppError(400, 'TXT содержит двоичные данные');
  }
  return content;
}
