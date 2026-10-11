import { NestFactory } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { HttpExceptionFilter } from './api/http-exception.filter';

// Прямой require обходит проблемы с совместимостью типом импорта hbs
const hbs = require('hbs');
// Загрузка переменных окружения (DB_*, MINIO_*) из .env
require('dotenv').config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  // CORS для SPA (фронтенд будет обращаться к /api/titration_pairs)
  app.enableCors();

  await app.listen(3000);
}
bootstrap();
