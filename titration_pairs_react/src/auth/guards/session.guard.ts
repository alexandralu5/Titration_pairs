import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { SESSION_COOKIE } from '../auth-user';

/**
 * Guard сессионной авторизации: читает куку sessionId, ищет сессию в Redis
 * и кладёт пользователя в req.user. Нет куки или сессии — 401.
 * Ставится на методы создателя (создание, публикация, удаление, лайк...).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.authService.getSessionUser(req.cookies?.[SESSION_COOKIE]);
    if (!user) {
      throw new UnauthorizedException();
    }
    req.user = user;
    return true;
  }
}

/**
 * Guard для публичных методов чтения: гостя пропускает (req.user = null),
 * а если сессия есть — подставляет пользователя, чтобы посчитать
 * признаки is_mine / is_liked.
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    req.user = await this.authService.getSessionUser(req.cookies?.[SESSION_COOKIE]);
    return true;
  }
}
