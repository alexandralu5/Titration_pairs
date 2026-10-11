import { NestFactory } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { HttpExceptionFilter } from './api/http-exception.filter';
import { SESSION_COOKIE } from './auth/auth-user';

// Прямой require обходит проблемы с совместимостью типом импорта hbs
const hbs = require('hbs');
// Загрузка переменных окружения (DB_*, MINIO_*, REDIS_*) из .env
require('dotenv').config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Разбор заголовка Cookie в req.cookies — оттуда guard берёт sessionId
  app.use(cookieParser());

  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');

  hbs.registerPartials(join(__dirname, '..', 'views/partials'));

  // Валидация входных DTO (как в методичке, секция 11):
  // whitelist — убирает поля, не описанные в DTO;
  // forbidNonWhitelisted — ошибка при лишних полях;
  // transform — преобразование типов (query/form-data приходят строками).
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Автоматически скрывает поля сущностей с @Exclude() (например, системные)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Тело любой ошибки пустое ({}), статус ошибки клиент берёт из HTTP-кода:
  // ни statusCode, ни error, ни message в JSON не отдаём.
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS для SPA (фронтенд будет обращаться к /api/titration_pairs).
  // Кука сессии уходит с другого origin только при credentials: true, а с ним
  // нельзя отвечать "*": разрешённые адреса фронтенда перечислены в CORS_ORIGIN.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Swagger UI: http://localhost:3000/api (JSON-схема — /api-json).
  // Кука sessionId — HttpOnly, поэтому после login в Swagger браузер сам
  // подставляет её в следующие запросы; замок у метода значит "нужна сессия".
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Titration Pairs API')
    .setDescription(
      'Веб-сервис пар титрования. Без авторизации доступно только чтение (список и лента). ' +
        'Методы создателя требуют сессию: выполните POST /api/titration_pairs/users/login — ' +
        'сервер поставит куку sessionId.',
    )
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE)
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, swaggerConfig));

  // Явно слушаем IPv4 (0.0.0.0): по умолчанию Node занимает только IPv6-адрес "::",
  // и тогда WSL не пробрасывает порт на 127.0.0.1 в Windows — Postman и браузер
  // на http://localhost:3000 получают "Could not send request".
  await app.listen(3000, '0.0.0.0');
}
bootstrap();
