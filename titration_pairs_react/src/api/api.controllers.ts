import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ApiService } from './api.service';
import { FeedServiceDto, IdDto, LikeResultDto, ListServiceDto, ServiceDto } from './serializers';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { LikeDto } from './dto/like.dto';
import { ServiceFiltersDto } from './dto/service-filters.dto';
import { AuthUser, CurrentUser } from '../auth/auth-user';
import { OptionalSessionGuard, SessionGuard } from '../auth/guards/session.guard';

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
 * Авторизация (сессия в Redis + кука sessionId):
 *  - чтение списка и ленты доступно гостю (OptionalSessionGuard: если сессия
 *    есть, по ней считаются is_mine / is_liked);
 *  - методы создателя закрыты SessionGuard — без сессии 401.
 *
 * Базовый префикс: /api/titration_pairs (ресурс — сами пары титрования)
 *  GET    /           — список опубликованных (фильтр ?minConcentration), признак is_mine 1/0
 *  GET    /feed       — лента: одна запись (первая опубликованная), признак is_liked 1/0
 *  GET    /feed/:id   — запись ленты (?next=true — следующая по ленте)
 *  GET    /draft      — [сессия] черновик создателя (не более 1)
 *  POST   /           — [сессия] создать черновик (multipart: title, image, video)
 *  PUT    /:id/image  — [сессия] заменить изображение услуги (multipart: image)
 *  PUT    /:id        — [сессия] обновить услугу (обновление черновика публикует его)
 *  DELETE /:id        — [сессия] soft delete (status = 'deleted')
 *  POST   /:id/like   — [сессия] { value: 1 } поставить / { value: 0 } снять
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

@ApiTags('Услуги')
@Controller('api/titration_pairs')
export class ServicesController {
  constructor(private readonly apiService: ApiService) {}

  @Get()
  @UseGuards(OptionalSessionGuard)
  @ApiOperation({
    summary: 'Список опубликованных услуг',
    description: 'Доступно без авторизации. Признак is_mine считается по сессии, для гостя он равен 0.',
  })
  @ApiOkResponse({ type: [ListServiceDto] })
  @ApiBadRequestResponse({ description: 'Невалидный фильтр' })
  list(@Query() filters: ServiceFiltersDto, @CurrentUser() user: AuthUser | null): Promise<ListServiceDto[]> {
    return this.apiService.listServices(filters?.minConcentration, user);
  }

  @Get('feed')
  @UseGuards(OptionalSessionGuard)
  @ApiOperation({
    summary: 'Лента: первая опубликованная услуга',
    description: 'Доступно без авторизации. Признак is_liked считается по сессии, для гостя он равен 0.',
  })
  @ApiOkResponse({ type: FeedServiceDto })
  @ApiNotFoundResponse({ description: 'Опубликованных услуг нет' })
  feed(@CurrentUser() user: AuthUser | null): Promise<FeedServiceDto> {
    return this.apiService.feed(user);
  }

  @Get('feed/:id')
  @UseGuards(OptionalSessionGuard)
  @ApiOperation({
    summary: 'Запись ленты по id',
    description: 'Доступно без авторизации. С ?next=true возвращает следующую за ней опубликованную запись.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiQuery({ name: 'next', required: false, enum: ['true', 'false'], description: 'true — вернуть следующую запись ленты' })
  @ApiOkResponse({ type: FeedServiceDto })
  @ApiNotFoundResponse({ description: 'Записи нет или следующей записи нет' })
  feedItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser | null,
    @Query('next') next?: string,
  ): Promise<FeedServiceDto> {
    return this.apiService.feedItem(id, next === 'true', user);
  }

  @Get('draft')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Черновик текущего пользователя', description: 'Пользователь берётся из сессии, id не указывается.' })
  @ApiOkResponse({ type: ServiceDto })
  @ApiUnauthorizedResponse({ description: 'Нет сессии' })
  @ApiNotFoundResponse({ description: 'Черновика нет' })
  draft(@CurrentUser() user: AuthUser): Promise<ServiceDto> {
    return this.apiService.getDraft(user);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @UseInterceptors(FileFieldsInterceptor(
    [
      { name: 'image', maxCount: 1 },
      { name: 'video', maxCount: 1 },
    ],
    { storage: memoryStorage(), limits: FILE_LIMITS, fileFilter: mimeFilter },
  ))
  @ApiOperation({
    summary: 'Создать услугу (черновик)',
    description: 'Создатель заполняется автоматически пользователем из сессии. Файлы сохраняются в MinIO.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', example: 'HCl + NaOH' },
        image: { type: 'string', format: 'binary', description: 'jpg, jpeg, png, gif, webp; до 10 МБ' },
        video: { type: 'string', format: 'binary', description: 'mp4, webm, mov; до 10 МБ' },
      },
    },
  })
  @ApiCreatedResponse({ type: ServiceDto })
  @ApiBadRequestResponse({ description: 'Нет названия, лишние поля или недопустимый тип файла' })
  @ApiUnauthorizedResponse({ description: 'Нет сессии' })
  create(
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files?: { image?: Express.Multer.File[]; video?: Express.Multer.File[] },
  ): Promise<ServiceDto> {
    return this.apiService.createDraft(dto, user, files?.image?.[0], files?.video?.[0]);
  }

  // Замена изображения — идемпотентная операция, поэтому PUT, а не POST:
  // повторный вызов с тем же файлом не создаёт новый ресурс.
  @Put(':id/image')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
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
  @ApiOperation({ summary: 'Заменить изображение услуги', description: 'Только создатель услуги или модератор. Старый файл удаляется из MinIO.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', format: 'binary', description: 'jpg, jpeg, png, gif, webp; до 10 МБ' },
      },
    },
  })
  @ApiOkResponse({ type: ServiceDto })
  @ApiBadRequestResponse({ description: 'Файл не передан или это не картинка' })
  @ApiUnauthorizedResponse({ description: 'Нет сессии' })
  @ApiForbiddenResponse({ description: 'Не создатель и не модератор' })
  @ApiNotFoundResponse({ description: 'Услуги нет' })
  uploadImage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<ServiceDto> {
    return this.apiService.uploadImage(id, user, image);
  }

  // Обновление услуги: PUT = изменить ресурс. В нашем домене обновление
  // черновика одновременно публикует его (draft -> published).
  @Put(':id')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Опубликовать услугу',
    description: 'Обновляет поля черновика и переводит его в published. Только создатель услуги или модератор.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: ServiceDto })
  @ApiBadRequestResponse({ description: 'Невалидные данные или услуга уже опубликована' })
  @ApiUnauthorizedResponse({ description: 'Нет сессии' })
  @ApiForbiddenResponse({ description: 'Не создатель и не модератор' })
  @ApiNotFoundResponse({ description: 'Услуги нет' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ServiceDto> {
    return this.apiService.updateService(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Удалить услугу', description: 'Логическое удаление (status = deleted). Только создатель услуги или модератор.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: IdDto })
  @ApiUnauthorizedResponse({ description: 'Нет сессии' })
  @ApiForbiddenResponse({ description: 'Не создатель и не модератор' })
  @ApiNotFoundResponse({ description: 'Услуги нет' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser): Promise<IdDto> {
    return this.apiService.deleteService(id, user);
  }

  @Post(':id/like')
  @HttpCode(201)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Поставить или снять лайк', description: 'Лайк ставится от имени пользователя сессии: value 1 — поставить, 0 — снять.' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiCreatedResponse({ type: LikeResultDto })
  @ApiBadRequestResponse({ description: 'value не 0 и не 1' })
  @ApiUnauthorizedResponse({ description: 'Нет сессии' })
  @ApiNotFoundResponse({ description: 'Услуги нет' })
  like(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LikeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<LikeResultDto> {
    return this.apiService.setLike(id, dto, user);
  }
}
