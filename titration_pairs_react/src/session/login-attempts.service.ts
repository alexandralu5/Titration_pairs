import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

/**
 * Lua-скрипт: регистрирует неудачную попытку входа.
 *
 * Redis выполняет скрипт целиком и атомарно — между INCR и EXPIRE не может
 * вклиниться ни одна другая команда. Поэтому счётчик никогда не останется
 * без времени жизни, даже если два запроса придут одновременно или
 * приложение упадёт между командами.
 *
 * KEYS[1] — ключ счётчика login_attempts:<логин>
 * ARGV[1] — окно блокировки в секундах
 * Возвращает число неудачных попыток в текущем окне.
 */
export const REGISTER_LOGIN_FAILURE_LUA = `
local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return attempts
`;

/** Клиент Redis с командой, которую добавляет defineCommand. */
type RedisWithScripts = Redis & {
  registerLoginFailure(key: string, windowSec: number): Promise<number>;
};

/**
 * Защита входа от подбора пароля.
 *
 * После LOGIN_MAX_ATTEMPTS неудачных попыток (по умолчанию 5) вход под этим
 * логином блокируется на LOGIN_BLOCK_SEC секунд (по умолчанию 15 минут),
 * считая от первой неудачной попытки. Успешный вход обнуляет счётчик.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly redis: RedisWithScripts;
  private readonly maxAttempts: number;
  private readonly windowSec: number;

  constructor(@Inject(REDIS_CLIENT) redis: Redis, config: ConfigService) {
    this.maxAttempts = parseInt(config.get<string>('LOGIN_MAX_ATTEMPTS') || '5', 10);
    this.windowSec = parseInt(config.get<string>('LOGIN_BLOCK_SEC') || '900', 10);

    // defineCommand загружает скрипт в Redis и вызывает его по SHA1 (EVALSHA),
    // а если Redis скрипт ещё не видел — отправляет текст скрипта (EVAL).
    redis.defineCommand('registerLoginFailure', { numberOfKeys: 1, lua: REGISTER_LOGIN_FAILURE_LUA });
    this.redis = redis as RedisWithScripts;
  }

  /** Исчерпан ли лимит неудачных попыток для логина. */
  async isBlocked(username: string): Promise<boolean> {
    const attempts = Number(await this.redis.get(this.key(username)));
    return attempts >= this.maxAttempts;
  }

  /** Регистрирует неудачную попытку (Lua-скрипт); возвращает их число в окне. */
  async registerFailure(username: string): Promise<number> {
    return this.redis.registerLoginFailure(this.key(username), this.windowSec);
  }

  /** Обнуляет счётчик после успешного входа. */
  async reset(username: string): Promise<void> {
    await this.redis.del(this.key(username));
  }

  private key(username: string): string {
    return `login_attempts:${username}`;
  }
}
