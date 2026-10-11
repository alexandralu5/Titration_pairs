import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Роли пользователей: обычный пользователь и модератор. */
export type UserRole = 'user' | 'moderator';

/**
 * Авторизованный пользователь запроса. Этот же объект хранится в Redis
 * как значение сессии и кладётся guard'ом в req.user.
 */
export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

/** Имя куки с идентификатором сессии. */
export const SESSION_COOKIE = 'sessionId';

/**
 * Параметр-декоратор: текущий пользователь запроса.
 * За SessionGuard всегда возвращает пользователя, за OptionalSessionGuard —
 * пользователя или null (гость).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | null =>
    context.switchToHttp().getRequest().user ?? null,
);
