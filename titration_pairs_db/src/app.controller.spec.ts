import { Controller, Get, Query, Render, Param } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('grid')
  @Render('grid')
  getGrid(@Query('concentration') concentration: string) {
    const pairs = this.appService.getPublished(concentration);
    const viewData = pairs.map(p => ({
      ...p,
      likesCount: p.likes.length
    }));
    return { 
      titration_pairs: viewData, 
      filterValue: concentration || 0 
    };
  }

  @Get('add')
  @Render('add')
  getAddPage() {
    return { draft: this.appService.getDraft() };
  }

  @Get('feed/:id?')
  @Render('feed')
  getFeed(@Param('id') id: string, @Query('next') next: string) {
    const item = this.appService.getFeedItem(id, next);
    return { item, likesCount: item.likes.length };
  }
}