import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../titration/entities/user.entity';
import { SessionService } from '../session/session.service';
import { serializeUser, UserDto } from '../api/serializers';
import { AuthUser, UserRole } from './auth-user';
import { hashPassword, verifyPassword } from './password';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/**
 * Домен "Пользователь": регистрация, аутентификация и деавторизация.
 *
 * Аутентификация сессионная (stateful): при входе создаётся запись в Redis
 * session:<sessionId> -> пользователь, клиенту уходит только sessionId в куке.
 * Исключения — без текстов, только со стандартным кодом (400, 401, 409).
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly sessionService: SessionService,
  ) {}

  // ==========================================================================
  // Регистрация: новый пользователь всегда получает роль 'user'.
  // POST /api/titration_pairs/users
  // ==========================================================================
  async register(dto: RegisterDto): Promise<UserDto> {
    const username = dto.username.trim();
    if (!username) {
      throw new BadRequestException();
    }

    const exists = await this.usersRepo.findOne({ where: { username } });
    if (exists) {
      throw new ConflictException();
    }

    const user = this.usersRepo.create({
      username,
      password: await hashPassword(dto.password),
      role: 'user',
    });
    await this.usersRepo.save(user);
    return serializeUser(user);
  }

  // ==========================================================================
  // Аутентификация: проверка логина/пароля и создание сессии в Redis.
  // Неверный логин и неверный пароль дают одинаковый ответ 401.
  // POST /api/titration_pairs/users/login
  // ==========================================================================
  async login(dto: LoginDto): Promise<{ sessionId: string; user: UserDto }> {
    // password объявлен в сущности с select: false — запрашиваем его явно
    const user = await this.usersRepo.findOne({
      where: { username: dto.username.trim() },
      select: { id: true, username: true, password: true, role: true, created_at: true },
    });
    if (!user || !(await verifyPassword(dto.password, user.password))) {
      throw new UnauthorizedException();
    }

    const sessionId = randomUUID();
    await this.sessionService.create(sessionId, {
      id: user.id,
      username: user.username,
      role: user.role as UserRole,
    });
    return { sessionId, user: serializeUser(user) };
  }

  // ==========================================================================
  // Деавторизация: сессия удаляется из Redis, кука перестаёт действовать сразу.
  // POST /api/titration_pairs/users/logout
  // ==========================================================================
  async logout(sessionId: string | undefined): Promise<void> {
    if (sessionId) {
      await this.sessionService.destroy(sessionId);
    }
  }

  /** Пользователь по sessionId из куки; null — гость (куки нет или сессия истекла). */
  async getSessionUser(sessionId: string | undefined): Promise<AuthUser | null> {
    if (!sessionId || typeof sessionId !== 'string') return null;
    return this.sessionService.getUser(sessionId);
  }

  /** Время жизни сессии в секундах — столько же живёт кука. */
  get sessionTtl(): number {
    return this.sessionService.ttl;
  }
}
