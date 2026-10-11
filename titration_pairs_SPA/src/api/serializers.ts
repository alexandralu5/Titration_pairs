/**
 * Сериализаторы (Data Transfer Objects).
 *
 * Модель (ORM-сущность) Titration хранит ВСЕ поля, включая системные
 * (id, status, creator_id, moderator_id, created_at, formed_at).
 * Эти системные поля ЗАПРЕЩЕНО передавать с клиента для изменения —
 * они вычисляются на бэкенде (через currentUser() и бизнес-логику).
 *
 * Сериализатор преобразует модель в безопасный для клиента объект:
 *  - оставляет только разрешённые поля;
 *  - НЕ отдаёт status: статус нужен только в БД, в интерфейсе
 *    это разные окна и выводить его некуда;
 *  - НЕ дублирует код состояния HTTP в теле ответа: код ответа
 *    задаётся отдельно (@HttpCode) и в JSON не попадает;
 *  - отдаёт публичный URL файла из Minio (в БД хранится только имя файла);
 *  - добавляет количество лайков.
 *
 * Инвариант: набор ключей ServiceDto ОДИНАКОВ для всех ответов.
 * Пустое значение отдаётся как null (или '' для строк), но ключ
 * присутствует всегда — GET черновика и GET ленты возвращают
 * одинаковый набор полей.
 */

import { bucketName } from './minio.provider';

/** Преобразует имя файла (или уже готовый URL) в публичный URL. */
export function fileUrl(value: string | null | undefined): string {
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('/')) return value;
  return `http://localhost:9000/${bucketName()}/${value}`;
}

/** Контракт ответа. Набор полей ОДИНАКОВ для всех методов домена. */
export interface ServiceDto {
  id: number;
  title: string;
  description: string | null;
  ph: number | null;
  concentration: number | null;
  image_url: string;
  video_url: string;
  likes_count: number;
  created_at: Date | null;
  formed_at: Date | null;
}

export function serializeService(row: any, likesCount: number): ServiceDto {
  return {
    id: Number(row.id),
    title: row.title ?? '',
    description: row.description ?? null,
    ph: row.ph != null ? Number(row.ph) : null,
    concentration: row.concentration != null ? Number(row.concentration) : null,
    image_url: fileUrl(row.image_url),
    video_url: fileUrl(row.video_url),
    likes_count: likesCount,
    created_at: row.created_at ?? null,
    formed_at: row.formed_at ?? null,
  };
}

export interface UserDto {
  id: number;
  username: string;
  created_at: Date | null;
}

export function serializeUser(row: any): UserDto {
  return {
    id: Number(row.id),
    username: row.username ?? '',
    created_at: row.created_at ?? null,
  };
}