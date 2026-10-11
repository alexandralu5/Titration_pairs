import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../titration/entities/user.entity';
import { AuthService } from './auth.service';
import { OptionalSessionGuard, SessionGuard } from './guards/session.guard';
import { UsersController } from './users.controller';

/**
 * Модуль домена "Пользователь": регистрация, вход, выход и guard'ы,
 * которыми остальные модули закрывают свои методы.
 * Сессии хранит глобальный SessionModule (Redis).
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [AuthService, SessionGuard, OptionalSessionGuard],
  exports: [AuthService, SessionGuard, OptionalSessionGuard],
})
export class AuthModule {}
