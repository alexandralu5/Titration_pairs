import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { LoginAttemptsService } from './login-attempts.service';
import { REDIS_CLIENT, redisProvider } from './redis.provider';
import { SessionService } from './session.service';

/** Глобальный модуль работы с Redis: сессии и счётчик неудачных входов. */
@Global()
@Module({
  providers: [redisProvider, SessionService, LoginAttemptsService],
  exports: [SessionService, LoginAttemptsService],
})
export class SessionModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
