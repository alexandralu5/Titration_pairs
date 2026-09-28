import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Titration } from '../titration/entities/titration.entity';
import { User } from '../titration/entities/user.entity';
import { Like } from '../titration/entities/like.entity';
import { ApiService } from './api.service';
import { ServicesController, UsersController } from './api.controllers';
import { minioClientProvider } from './minio.provider';

/**
 * Модуль REST-веб-сервиса /api для SPA.
 *
 * Зависимости доменов от моделей (в коде):
 *   Домен "Услуга"       (ServicesController, ApiService) -> модели Titration, Like
 *   Домен "Пользователь" (UsersController, ApiService)    -> модель User
 * Модели (ORM-сущности) определены в src/titration/entities/*.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Titration, User, Like])],
  controllers: [ServicesController, UsersController],
  providers: [ApiService, minioClientProvider],
})
export class ApiModule {}