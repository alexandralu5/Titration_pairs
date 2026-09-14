/// <reference types="multer" />
import { Controller, Get, Post, Query, Render, Param, UseInterceptors, UploadedFiles, Res } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AppService, TitrationPair } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('grid')
  @Render('grid')
  getGrid(@Query('concentration') concentration: string) {
    const pairs: TitrationPair[] = this.appService.getPublished(concentration);
    const viewData = pairs.map((p: TitrationPair) => ({
      ...p,
      likesCount: p.likes.length
    }));
    return {
      titration_pairs: viewData,
      filterValue: concentration || '0'
    };
  }

  @Get('add')
  @Render('add')
  getAddPage() {
    return { draft: this.appService.getDraft() };
  }

  @Post('add')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 },
  ]))
  async handleAddPost(
    @UploadedFiles() files: { image?: Express.Multer.File[]; video?: Express.Multer.File[] },
    @Res() res: Response
  ) {
    const image = files?.image?.[0];
    const video = files?.video?.[0];

    await this.appService.updateDraftWithFiles(image, video);

    return res.redirect('/add');
  }

  @Get(['feed', 'feed/:id'])
  @Render('feed')
  getFeed(@Param('id') id: string) {
    const feedData = this.appService.getFeedData(id);
    return {
      ...feedData,
      likesCount: feedData.item.likes.length
    };
  }
}
