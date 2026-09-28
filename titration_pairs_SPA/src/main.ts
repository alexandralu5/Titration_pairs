import { NestFactory } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

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

  // CORS для SPA (фронтенд будет обращаться к /api)
  app.enableCors();

  await app.listen(3000);
}
bootstrap();
