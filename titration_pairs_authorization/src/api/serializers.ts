/**
 * Сериализаторы (Data Transfer Objects).
 *
 * Модель (ORM-сущность) Titration хранит ВСЕ поля, включая системные
 * (id, status, creator_id, moderator_id, created_at, formed_at).
 * Эти системные поля ЗАПРЕЩЕНО передавать с клиента для изменения —
 * они вычисляются на бэкенде (пользователь берётся из сессии, остальное —
 * бизнес-логика).
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
 * Инвариант: базовый набор ключей ServiceDto ОДИНАКОВ для всех ответов.
 * Пустое значение отдаётся как null (или '' для строк), но ключ
 * присутствует всегда.
 *
 * Два метода добавляют к базовому набору по одному признаку (1 или 0)
 * относительно текущего пользователя (для гостя оба признака равны 0):
 *  - GET ленты   -> is_liked: пользователь лайкнул эту услугу;
 *  - GET списка  -> is_mine: пользователь — создатель услуги.
 * В остальных ответах этих признаков нет.
 *
 * DTO объявлены классами с @ApiProperty, чтобы Swagger показывал схему ответа.
 */

import { ApiProperty } from '@nestjs/swagger';
import { bucketName } from './minio.provider';

/** Преобразует имя файла (или уже готовый URL) в публичный URL. */
export function fileUrl(value: string | null | undefined): string {
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('/')) return value;
  return `http://localhost:9000/${bucketName()}/${value}`;
}

/** Базовый контракт ответа. Этот набор полей есть во всех методах домена. */
export class ServiceDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'HCl + NaOH' })
  title: string;

  @ApiProperty({ type: String, nullable: true, example: 'Точка эквивалентности при pH 7.0' })
  description: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 7 })
  ph: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.1 })
  concentration: number | null;

  @ApiProperty({ example: 'http://localhost:9000/titration/img_1.jpg', description: 'Публичный URL картинки или пустая строка' })
  image_url: string;

  @ApiProperty({ example: 'http://localhost:9000/titration/video_1.mp4', description: 'Публичный URL видео или пустая строка' })
  video_url: string;

  @ApiProperty({ example: 3 })
  likes_count: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  created_at: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Дата публикации; null у черновика' })
  formed_at: Date | null;
}

/** Запись ленты: базовые поля + признак "текущий пользователь лайкнул". */
export class FeedServiceDto extends ServiceDto {
  @ApiProperty({ enum: [0, 1], example: 1, description: '1 — текущий пользователь поставил лайк; для гостя всегда 0' })
  is_liked: 0 | 1;
}

/** Карточка списка (плитки): базовые поля + признак "текущий пользователь — создатель". */
export class ListServiceDto extends ServiceDto {
  @ApiProperty({ enum: [0, 1], example: 0, description: '1 — текущий пользователь создал услугу; для гостя всегда 0' })
  is_mine: 0 | 1;
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

export function serializeFeedService(row: any, likesCount: number, isLiked: boolean): FeedServiceDto {
  return { ...serializeService(row, likesCount), is_liked: isLiked ? 1 : 0 };
}

export function serializeListService(row: any, likesCount: number, isMine: boolean): ListServiceDto {
  return { ...serializeService(row, likesCount), is_mine: isMine ? 1 : 0 };
}

/** Результат лайка / снятия лайка. */
export class LikeResultDto {
  @ApiProperty({ example: true })
  liked: boolean;

  @ApiProperty({ example: 4 })
  likes_count: number;
}

/** Ответ, в котором нужен только идентификатор (удаление услуги, выход). */
export class IdDto {
  @ApiProperty({ example: 1 })
  id: number;
}

/** Пользователь без пароля: хеш пароля клиенту не отдаётся никогда. */
export class UserDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'admin' })
  username: string;

  @ApiProperty({ enum: ['user', 'moderator'], example: 'user' })
  role: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  created_at: Date | null;
}

export function serializeUser(row: any): UserDto {
  return {
    id: Number(row.id),
    username: row.username ?? '',
    role: row.role ?? 'user',
    created_at: row.created_at ?? null,
  };
}