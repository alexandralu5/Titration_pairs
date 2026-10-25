/// <reference types="multer" />
import {
  Controller,
  Get,
  Post,
  Query,
  Render,
  Param,
  UseInterceptors,
  UploadedFiles,
  Req,
  Res,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AppService } from './app.service';
import { AuthService } from './auth/auth.service';
import { AuthUser, SESSION_COOKIE } from './auth/auth-user';

/**
 * SSR-страницы (Handlebars). В Swagger не попадают — там только JSON API.
 *
 * Чтение (/grid, /feed) открыто гостю. Страницы, которые изменяют данные
 * (/add, /delete), и /profile требуют сессию: гость уходит редиректом на /login.
 * Сессия та же, что у API, — кука sessionId и запись в Redis.
 */
@ApiExcludeController()
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
  ) {}

  /** Пользователь сессии или null (гость). */
  private sessionUser(req: Request): Promise<AuthUser | null> {
    return this.authService.getSessionUser(req.cookies?.[SESSION_COOKIE]);
  }

  @Get('grid')
  @Render('grid')
  async getGrid(@Query('concentration') concentration: string) {
    const data = await this.appService.getPublished(concentration);
    return {
      data,
      filterValue: concentration || '0',
    };
  }

  @Get('add')
  async getAddPage(@Req() req: Request, @Res() res: Response) {
    const user = await this.sessionUser(req);
    if (!user) {
      return res.redirect('/login');
    }
    const draft = await this.appService.getDraft(user);
    return res.render('add', { draft });
  }

  @Post(['add', 'add/step1'])
  async createDraftStep(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const user = await this.sessionUser(req);
    if (!user) {
      return res.redirect('/login');
    }
    await this.appService.createDraft(body?.title, user);
    return res.redirect('/add');
  }

  @Post('add/publish')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'video', maxCount: 1 },
    ]),
  )
  async handlePublish(
    @UploadedFiles() files: { image?: Express.Multer.File[]; video?: Express.Multer.File[] },
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = await this.sessionUser(req);
    if (!user) {
      return res.redirect('/login');
    }
    const image = files?.image?.[0];
    const video = files?.video?.[0];
    await this.appService.publishDraft(body, user, image, video);
    return res.redirect('/grid');
  }

  @Post('delete')
  async handleDelete(@Body('id') id: string, @Req() req: Request, @Res() res: Response) {
    const user = await this.sessionUser(req);
    if (!user) {
      return res.redirect('/login');
    }
    await this.appService.deletePair(id, user); // Обязательный await!
    return res.redirect('/grid');
  }

  @Get(['feed', 'feed/:id'])
  @Render('feed')
  async getFeed(@Param('id') id: string) {
    const data = await this.appService.getFeedData(id);

    if (!data) {
      throw new NotFoundException();
    }

    return data;
  }

  // --- Страницы домена "Пользователь" ---

  @Get('login')
  async getLogin(@Req() req: Request, @Res() res: Response) {
    if (await this.sessionUser(req)) {
      return res.redirect('/profile');
    }
    return res.render('login');
  }

  @Get('register')
  @Render('register')
  getRegister() {
    return {};
  }

  @Get('profile')
  async getProfile(@Req() req: Request, @Res() res: Response) {
    const user = await this.sessionUser(req);
    if (!user) {
      return res.redirect('/login');
    }
    return res.render('profile', { user });
  }
}
