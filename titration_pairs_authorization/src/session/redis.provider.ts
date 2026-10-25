import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * Одно подключение к Redis на всё приложение. Его используют хранилище
 * сессий (SessionService) и счётчик неудачных входов (LoginAttemptsService).
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const logger = new Logger('Redis');
    const redis = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: parseInt(config.get<string>('REDIS_PORT') || '6379', 10),
      // Если Redis недоступен, запрос падает с ошибкой, а не висит бесконечно
      maxRetriesPerRequest: 2,
    });
    redis.on('error', (err) => {
      logger.error(`Redis error: ${err.message}`);
    });
    return redis;
  },
};
