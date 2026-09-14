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
  Res,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
  @Render('add')
  async getAddPage() {
    const draft = await this.appService.getDraft();
    return { draft };
  }

  @Post(['add/publish', 'add'])
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'video', maxCount: 1 },
    ]),
  )
  async handlePublish(
    @UploadedFiles() files: { image?: Express.Multer.File[]; video?: Express.Multer.File[] },
    @Body() body: any,
    @Res() res: Response,
  ) {
    const image = files?.image?.[0];
    const video = files?.video?.[0];
    await this.appService.publishDraft(body, image, video);
    return res.redirect('/grid');
  }

  @Post('delete')
  async handleDelete(@Body('id') id: string, @Res() res: Response) {
    await this.appService.deletePair(id); // Обязательный await!
    return res.redirect('/grid');
  }

  @Get(['feed', 'feed/:id'])
  @Render('feed')
  async getFeed(@Param('id') id: string) {
    const data = await this.appService.getFeedData(id);

    if (!data) {
      throw new NotFoundException('Опыт с данным ID не найден или был удален');
    }

    return data;
  }
}
