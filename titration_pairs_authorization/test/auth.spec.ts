import { ExecutionContext, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { AuthUser } from '../src/auth/auth-user';
import { OptionalSessionGuard, SessionGuard } from '../src/auth/guards/session.guard';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { serializeUser } from '../src/api/serializers';
import { LoginAttemptsService } from '../src/session/login-attempts.service';
import { SessionService } from '../src/session/session.service';

const USER: AuthUser = { id: 2, username: 'ivanov', role: 'user' };

/** AuthService, у которого сессия есть только для куки sessionId=valid. */
function authServiceStub(): AuthService {
  return {
    getSessionUser: vi.fn(async (sessionId?: string) => (sessionId === 'valid' ? USER : null)),
  } as unknown as AuthService;
}

function contextWith(cookies?: Record<string, string>) {
  const req: any = { cookies };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, context };
}

describe('Хеширование паролей', () => {
  it('хеш не содержит пароль и подтверждается только верным паролем', async () => {
    const hash = await hashPassword('secret123');

    expect(hash).not.toContain('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
    expect(await verifyPassword('secret124', hash)).toBe(false);
  });

  it('одинаковые пароли дают разные хеши (своя соль)', async () => {
    expect(await hashPassword('secret123')).not.toBe(await hashPassword('secret123'));
  });

  it.each([null, undefined, '', 'plain-text', 'scrypt$$', 'md5$aa$bb'])(
    'пользователь без пароля или с битым хешем войти не может: %s',
    async (stored) => {
      expect(await verifyPassword('secret123', stored)).toBe(false);
    },
  );
});

describe('SessionGuard — методы создателя', () => {
  it.each([
    ['куки нет', undefined],
    ['в куках нет sessionId', {}],
    ['сессии нет в Redis', { sessionId: 'expired' }],
  ])('гость получает 401: %s', async (_name, cookies) => {
    const guard = new SessionGuard(authServiceStub());
    const { context } = contextWith(cookies);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('с действующей сессией пропускает и кладёт пользователя в req.user', async () => {
    const guard = new SessionGuard(authServiceStub());
    const { req, context } = contextWith({ sessionId: 'valid' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual(USER);
  });
});

describe('OptionalSessionGuard — публичное чтение', () => {
  it('гостя пропускает с req.user = null', async () => {
    const guard = new OptionalSessionGuard(authServiceStub());
    const { req, context } = contextWith(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toBeNull();
  });

  it('с сессией подставляет пользователя', async () => {
    const guard = new OptionalSessionGuard(authServiceStub());
    const { req, context } = contextWith({ sessionId: 'valid' });

    await guard.canActivate(context);
    expect(req.user).toEqual(USER);
  });
});

describe('Сериализатор пользователя', () => {
  it('не отдаёт пароль', () => {
    const dto = serializeUser({ id: 1, username: 'admin', role: 'moderator', password: 'scrypt$aa$bb', created_at: null });

    expect(dto).toEqual({ id: 1, username: 'admin', role: 'moderator', created_at: null });
    expect(dto).not.toHaveProperty('password');
  });
});

describe('AuthService.login — ограничение неудачных попыток', () => {
  async function setup(blocked = false) {
    const stored = { id: 1, username: 'admin', role: 'moderator', created_at: null, password: await hashPassword('admin123') };
    const usersRepo = { findOne: vi.fn(async ({ where }) => (where.username === 'admin' ? stored : null)) };
    const sessions = { create: vi.fn(async () => undefined) };
    const attempts = {
      isBlocked: vi.fn(async () => blocked),
      registerFailure: vi.fn(async () => 1),
      reset: vi.fn(async () => undefined),
    };
    const service = new AuthService(
      usersRepo as any,
      sessions as unknown as SessionService,
      attempts as unknown as LoginAttemptsService,
    );
    return { service, usersRepo, sessions, attempts };
  }

  it('неверный пароль: попытка засчитывается, ответ 401, сессии нет', async () => {
    const { service, attempts, sessions } = await setup();

    await expect(service.login({ username: 'admin', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(attempts.registerFailure).toHaveBeenCalledWith('admin');
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('неизвестный логин тоже засчитывается как неудачная попытка', async () => {
    const { service, attempts } = await setup();

    await expect(service.login({ username: 'nobody', password: 'admin123' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(attempts.registerFailure).toHaveBeenCalledWith('nobody');
  });

  it('успешный вход обнуляет счётчик и создаёт сессию', async () => {
    const { service, attempts, sessions } = await setup();

    const { user } = await service.login({ username: ' admin ', password: 'admin123' });
    expect(user.username).toBe('admin');
    expect(attempts.reset).toHaveBeenCalledWith('admin');
    expect(sessions.create).toHaveBeenCalledOnce();
  });

  it('при исчерпанном лимите — 429, даже с верным паролем; база и пароль не проверяются', async () => {
    const { service, usersRepo, sessions } = await setup(true);

    const error = await service.login({ username: 'admin', password: 'admin123' }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(usersRepo.findOne).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
