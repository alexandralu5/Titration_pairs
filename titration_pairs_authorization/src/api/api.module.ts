import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Titration } from '../titration/entities/titration.entity';
import { Like } from '../titration/entities/like.entity';
import { AuthModule } from '../auth/auth.module';
import { ApiService } from './api.service';
import { ServicesController } from './api.controllers';
import { minioClientProvider } from './minio.provider';

/**
 * Модуль REST-веб-сервиса /api/titration_pairs для SPA — домен "Услуга".
 *
 * Зависимости доменов от моделей (в коде):
 *   Домен "Услуга"       (ServicesController, ApiService)  -> модели Titration, Like
 *   Домен "Пользователь" (UsersController, AuthService)    -> модель User, см. AuthModule
 * Модели (ORM-сущности) определены в src/titration/entities/*.
 *
 * AuthModule импортируется ради SessionGuard / OptionalSessionGuard,
 * которыми закрыты методы контроллера.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Titration, Like]), AuthModule],
  controllers: [ServicesController],
  providers: [ApiService, minioClientProvider],
})
export class ApiModule {}
