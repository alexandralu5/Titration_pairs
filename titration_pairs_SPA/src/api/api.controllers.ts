import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiService } from './api.service';
import { ServiceDto } from './serializers';
import { CreateServiceDto } from './dto/create-service.dto';
import { PublishServiceDto } from './dto/publish-service.dto';
import { LikeDto } from './dto/like.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ServiceFiltersDto } from './dto/service-filters.dto';

/**
 * REST-контроллер домена "Услуга".
 * Все методы начинаются с префикса /api.
 *
 * URL-дизайн:
 *  GET    /api/services            — список опубликованных (фильтр minConcentration)
 *  GET    /api/services/feed       — лента опубликованных
 *  GET    /api/services/feed/:id   — запись ленты (?next=true → следующая)
 *  GET    /api/services/draft      — черновик создателя (не более 1)
 *  POST   /api/services            — создать черновик (multipart: title, image, video)
 *  POST   /api/services/:id/image  — заменить изображение услуги (multipart: image)
 *  PUT    /api/services/:id/publish— опубликовать черновик (draft → published)
 *  DELETE /api/services/:id        — soft delete (status = 'deleted')
 *  POST   /api/services/:id/like   — { value: 1 } поставить / { value: 0 } снять
 */

// Допустимые типы файлов по расширению (приём по имени, т.к. curl/внешние клиенты
// отправляют application/octet-stream): картинки jpg/jpeg/png/gif/webp, видео mp4/webm/mov
function mimeFilter(_req: any, file: Express.Multer.File, callback: (error: Error | null, ok: boolean) => void) {
  const imageOk = /\.(jpe?g|png|gif|webp)$/i.test(file.originalname);
  const videoOk = /\.(mp4|webm|mov)$/i.test(file.originalname);
  if (file.fieldname === 'image' && !imageOk) {
    return callback(new BadRequestException('Только изображения (jpg, jpeg, png, gif, webp)'), false);
  }
  if (file.fieldname === 'video' && !videoOk) {
    return callback(new BadRequestException('Только видео (mp4, webm, mov)'), false);
  }
  callback(null, true);
}

const FILE_LIMITS = { fileSize: 10 * 1024 * 1024 }; // 10MB

@Controller('api/services')
export class ServicesController {
  constructor(private readonly apiService: ApiService) {}

  @Get()
  list(@Query() filters: ServiceFiltersDto): Promise<ServiceDto[]> {
    return this.apiService.listServices(filters?.minConcentration);
  }

  @Get('feed')
  feed(): Promise<ServiceDto[]> {
    return this.apiService.feed();
  }

  @Get('feed/:id')
  feedItem(
    @Param('id', ParseIntPipe) id: number,
    @Query('next') next?: string,
  ): Promise<ServiceDto> {
    return this.apiService.feedItem(id, next === 'true');
  }

  @Get('draft')
  draft(): Promise<ServiceDto> {
    return this.apiService.getDraft();
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileFieldsInterceptor(
    [
      { name: 'image', maxCount: 1 },
      { name: 'video', maxCount: 1 },
    ],
    { storage: memoryStorage(), limits: FILE_LIMITS, fileFilter: mimeFilter },
  ))
  create(
    @Body() dto: CreateServiceDto,
    @UploadedFiles() files?: { image?: Express.Multer.File[]; video?: Express.Multer.File[] },
  ): Promise<ServiceDto> {
    return this.apiService.createDraft(dto, files?.image?.[0], files?.video?.[0]);
  }

  @Post(':id/image')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: FILE_LIMITS,
    fileFilter: (_req, file, cb) => {
      if (!/\.(jpe?g|png|gif|webp)$/i.test(file.originalname)) {
        return cb(new BadRequestException('Только изображения (jpg, jpeg, png, gif, webp)'), false);
      }
      cb(null, true);
    },
  }))
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<ServiceDto> {
    return this.apiService.uploadImage(id, image);
  }

  @Put(':id/publish')
  publish(@Param('id', ParseIntPipe) id: number, @Body() dto: PublishServiceDto): Promise<ServiceDto> {
    return this.apiService.publishDraft(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; status: string }> {
    return this.apiService.deleteService(id);
  }

  @Post(':id/like')
  @HttpCode(201)
  like(@Param('id', ParseIntPipe) id: number, @Body() dto: LikeDto): Promise<{ liked: boolean; likes_count: number }> {
    return this.apiService.setLike(id, dto);
  }
}

/**
 * REST-контроллер домена "Пользователь".
 *  POST /api/users/register — регистрация { username }
 *  POST /api/users/login    — аутентификация (заглушка)
 *  POST /api/users/logout   — деавторизация (заглушка)
 */
@Controller('api/users')
export class UsersController {
  constructor(private readonly apiService: ApiService) {}

  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterUserDto): Promise<any> {
    return this.apiService.register(dto);
  }

  @Post('login')
  login(@Body() body: any): Promise<any> {
    return this.apiService.login(body);
  }

  @Post('logout')
  logout(): Promise<any> {
    return this.apiService.logout();
  }
}