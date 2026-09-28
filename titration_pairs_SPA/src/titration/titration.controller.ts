import { Controller, Get, Post, Body, Param, Render, Redirect } from '@nestjs/common';
import {TitrationService } from './titration.service';

@Controller()
export class TitrationController {
  constructor(private service: TitrationService) {}

  @Get('grid') // Метод 1
  @Render('grid')
  async grid() {
    return { data: await this.service.getPublishedGrid() };
  }

  @Get('feed/:id') // Метод 2
  @Render('feed')
  async feed(@Param('id') id: number) {
    return { item: await this.service.getTitrationById(id) };
  }

  @Get('add') // Метод 3
  @Render('add')
  async addPage() {
    const draft = await this.service.getDraft(1); // Хардкодим пользователя id=1
    return { draft };
  }

  @Post('add/step1') // Метод 4 (Кнопка Далее)
  @Redirect('/add')
  async createDraft(@Body() body: any) {
    await this.service.createDraft(1, body.title, body.image_url, body.video_url);
  }

  @Post('add/publish') // Метод 5 (Кнопка Опубликовать)
  @Redirect('/grid')
  async publish(@Body() body: any) {
    await this.service.publishDraft(body.id, body.description, parseFloat(body.ph), parseFloat(body.concentration));
  }

  @Post('delete') // Метод 6 (SQL Удаление)
  @Redirect('/grid')
  async deleteSQL(@Body('id') id: number) {
    await this.service.deleteSQL(id);
  }
}
