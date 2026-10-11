import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiService } from './api.service';
import { FeedServiceDto, ListServiceDto, ServiceDto } from './serializers';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { LikeDto } from './dto/like.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ServiceFiltersDto } from './dto/service-filters.dto';

/**
 * REST-контроллер домена "Услуга".
 *
 * URL-дизайн по требованиям методички:
 *  - действие задаёт HTTP-метод: GET — прочитать, POST — создать,
 *    PUT — изменить, DELETE — удалить;
 *  - идентификатор объекта передаётся в пути (:id);
 *  - фильтры и условия выборки передаются в строке запроса
 *    (?minConcentration=, ?next=).
 *
 * Базовый префикс: /api/titration_pairs (ресурс — сами пары титрования)
 *  GET    /           — список опубликованных (фильтр ?minConcentration), признак is_mine 1/0
 *  GET    /feed       — лента: одна запись (первая опубликованная), признак is_liked 1/0
 *  GET    /feed/:id   — запись ленты (?next=true — следующая по ленте)
 *  GET    /draft      — черновик создателя (не более 1)
 *  POST   /           — создать черновик (multipart: title, image, video)
 *  PUT    /:id/image  — заменить изображение услуги (multipart: image)
 *  PUT    /:id        — обновить услугу (обновление черновика публикует его)
 *  DELETE /:id        — soft delete (status = 'deleted')
 *  POST   /:id/like   — { value: 1 } поставить / { value: 0 } снять
 */

// Допустимые типы файлов по расширению (приём по имени, т.к. curl/внешние клиенты
// отправляют application/octet-stream): картинки jpg/jpeg/png/gif/webp, видео mp4/webm/mov
function mimeFilter(_req: any, file: Express.Multer.File, callback: (error: Error | null, ok: boolean) => void) {
  const imageOk = /\.(jpe?g|png|gif|webp)$/i.test(file.originalname);
  const videoOk = /\.(mp4|webm|mov)$/i.test(file.originalname);
  if (file.fieldname === 'image' && !imageOk) {
    return callback(new BadRequestException(), false);
  }
  if (file.fieldname === 'video' && !videoOk) {
    return callback(new BadRequestException(), false);
  }
  callback(null, true);
}

const FILE_LIMITS = { fileSize: 10 * 1024 * 1024 }; // 10MB

@Controller('api/titration_pairs')
export class ServicesController {
  constructor(private readonly apiService: ApiService) {}

  @Get()
  list(@Query() filters: ServiceFiltersDto): Promise<ListServiceDto[]> {
    return this.apiService.listServices(filters?.minConcentration);
  }

  @Get('feed')
  feed(): Promise<FeedServiceDto> {
    return this.apiService.feed();
  }

  @Get('feed/:id')
  feedItem(
    @Param('id', ParseIntPipe) id: number,
    @Query('next') next?: string,
  ): Promise<FeedServiceDto> {
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

  // Замена изображения — идемпотентная операция, поэтому PUT, а не POST:
  // повторный вызов с тем же файлом не создаёт новый ресурс.
  @Put(':id/image')
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: FILE_LIMITS,
    fileFilter: (_req, file, cb) => {
      if (!/\.(jpe?g|png|gif|webp)$/i.test(file.originalname)) {
        return cb(new BadRequestException(), false);
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

  // Обновление услуги: PUT = изменить ресурс. В нашем домене обновление
  // черновика одновременно публикует его (draft -> published).
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceDto> {
    return this.apiService.updateService(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ id: number }> {
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
 *  POST /api/titration_pairs/users        — регистрация { username }
 *  POST /api/titration_pairs/users/login  — аутентификация (заглушка для 4-й лабораторной)
 *  POST /api/titration_pairs/users/logout — деавторизация (заглушка для 4-й лабораторной)
 */
@Controller('api/titration_pairs/users')
export class UsersController {
  constructor(private readonly apiService: ApiService) {}

  @Post()
  @HttpCode(201)
  register(@Body() dto: RegisterUserDto): Promise<any> {
    return this.apiService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: any): Promise<any> {
    return this.apiService.login(body);
  }

  @Post('logout')
  @HttpCode(200)
  logout(): Promise<any> {
    return this.apiService.logout();
  }
}
