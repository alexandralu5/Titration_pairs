import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { IdDto, UserDto } from '../api/serializers';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser, SESSION_COOKIE } from './auth-user';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionGuard } from './guards/session.guard';

/**
 * REST-контроллер домена "Пользователь".
 *  POST /api/titration_pairs/users        — регистрация { username, password }
 *  POST /api/titration_pairs/users/login  — аутентификация, ставит куку sessionId
 *  POST /api/titration_pairs/users/logout — деавторизация, удаляет сессию из Redis
 */
@ApiTags('Пользователи')
@Controller('api/titration_pairs/users')
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Регистрация', description: 'Создаёт пользователя с ролью user. Пароль хранится в виде хеша.' })
  @ApiCreatedResponse({ type: UserDto })
  @ApiBadRequestResponse({ description: 'Невалидные данные или лишние поля' })
  @ApiConflictResponse({ description: 'Логин уже занят' })
  register(@Body() dto: RegisterDto): Promise<UserDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Аутентификация',
    description:
      'Проверяет логин и пароль, создаёт сессию в Redis и ставит HttpOnly-куку sessionId. ' +
      'После 5 неудачных попыток вход под этим логином блокируется на 15 минут.',
  })
  @ApiOkResponse({ type: UserDto, description: 'В заголовке Set-Cookie приходит sessionId' })
  @ApiBadRequestResponse({ description: 'Невалидные данные или лишние поля' })
  @ApiUnauthorizedResponse({ description: 'Неверный логин или пароль' })
  @ApiTooManyRequestsResponse({ description: 'Слишком много неудачных попыток, вход временно заблокирован' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const { sessionId, user } = await this.authService.login(dto);

    // Повторный вход: прежняя сессия этого браузера больше не нужна
    await this.authService.logout(req.cookies?.[SESSION_COOKIE]);

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true, // недоступна из JavaScript — защита от кражи через XSS
      sameSite: 'lax', // не отправляется с чужих сайтов — защита от CSRF
      secure: process.env.NODE_ENV === 'production',
      maxAge: this.authService.sessionTtl * 1000,
    });
    return user;
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Деавторизация', description: 'Удаляет сессию из Redis и очищает куку sessionId.' })
  @ApiOkResponse({ type: IdDto, description: 'id пользователя, который вышел' })
  @ApiUnauthorizedResponse({ description: 'Нет сессии' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IdDto> {
    await this.authService.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE);
    return { id: user.id };
  }
}
