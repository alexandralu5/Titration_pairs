import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { AuthUser } from '../auth/auth-user';

/**
 * Хранилище активных сессий в Redis (stateful-аутентификация).
 *
 * Ключ:      session:<sessionId>
 * Значение:  JSON пользователя { id, username, role }
 * TTL:       SESSION_TTL секунд (по умолчанию 1 час) — Redis сам удаляет
 *            просроченную сессию, отдельная очистка не нужна.
 *
 * В куке клиента лежит только sessionId; кто за ним стоит, знает только сервер.
 * Удаление ключа (logout) мгновенно деавторизует пользователя.
 */
@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly redis: Redis;
  private readonly ttlSec: number;

  constructor(config: ConfigService) {
    this.ttlSec = parseInt(config.get<string>('SESSION_TTL') || '3600', 10);
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: parseInt(config.get<string>('REDIS_PORT') || '6379', 10),
      // Если Redis недоступен, запрос падает с ошибкой, а не висит бесконечно
      maxRetriesPerRequest: 2,
    });
    this.redis.on('error', (err) => {
      this.logger.error(`Redis SessionStore error: ${err.message}`);
    });
  }

  /** Время жизни сессии в секундах (кука живёт столько же). */
  get ttl(): number {
    return this.ttlSec;
  }

  /** Создаёт сессию: session:<sessionId> -> пользователь. */
  async create(sessionId: string, user: AuthUser): Promise<void> {
    await this.redis.setex(this.key(sessionId), this.ttlSec, JSON.stringify(user));
  }

  /** Возвращает пользователя сессии или null, если сессии нет / она истекла. */
  async getUser(sessionId: string): Promise<AuthUser | null> {
    const raw = await this.redis.get(this.key(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  /** Удаляет сессию (logout). */
  async destroy(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  private key(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
