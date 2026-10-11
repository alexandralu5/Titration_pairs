import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, MoreThanOrEqual, Repository } from 'typeorm';
import * as Minio from 'minio';
import { Titration } from '../titration/entities/titration.entity';
import { Like } from '../titration/entities/like.entity';
import { AuthUser } from '../auth/auth-user';
import {
  FeedServiceDto,
  ListServiceDto,
  serializeFeedService,
  serializeListService,
  serializeService,
  ServiceDto,
} from './serializers';
import { bucketName, MINIO_CLIENT } from './minio.provider';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { LikeDto } from './dto/like.dto';

/**
 * Домен "Услуга/опыт". Домен "Пользователь" — в src/auth/auth.service.ts.
 *
 * URL-дизайн: действие задаёт HTTP-метод, id — в пути, фильтры — в строке
 * запроса. Услуги лежат прямо под /api/titration_pairs.
 *
 * Бизнес-логика:
 *  - записи со статусом 'deleted' клиенту НЕ возвращаются;
 *  - статусы нельзя менять "с любого на любой": только создатель через
 *    два метода (POST create → draft, PUT update → published), вернуться
 *    в черновик нельзя;
 *  - системные поля (id, status, creator, moderator, даты) не принимаются
 *    от клиента — вычисляются на бэкенде;
 *  - текущий пользователь приходит из сессии (SessionGuard -> @CurrentUser())
 *    и передаётся в метод параметром user; при создании услуги он
 *    автоматически записывается её создателем;
 *  - чтение (список, лента) доступно гостю — тогда user = null;
 *  - изменять и удалять услугу может её создатель или модератор.
 *
 * Формат ответов:
 *  - код состояния отдаётся отдельным параметром ответа (@HttpCode),
 *    в тело JSON он НЕ дублируется;
 *  - status в ответе не отдаётся — он нужен только в БД;
 *  - исключения выбрасываются без текстов, только со стандартным кодом
 *    (404 — не найдено, 403 — чужой объект, 400 — некорректный ввод);
 *  - базовый набор полей ServiceDto всегда одинаковый, пустые значения — null;
 *  - is_liked (1/0) отдаётся только в ленте, is_mine (1/0) — только в списке;
 *    оба считаются относительно пользователя сессии, для гостя равны 0.
 */
@Injectable()
export class ApiService {
  constructor(
    @InjectRepository(Titration) private readonly titrationsRepo: Repository<Titration>,
    @InjectRepository(Like) private readonly likesRepo: Repository<Like>,
    @Inject(MINIO_CLIENT) private readonly minio: Minio.Client,
  ) {}

  // ==========================================================================
  // Домен "Услуга" — список с фильтрацией (только опубликованные)
  // Признак is_mine (1/0): создатель услуги совпадает с текущим пользователем.
  // GET /api/titration_pairs?minConcentration=0.1
  // ==========================================================================
  async listServices(minConcentration: number | undefined, user: AuthUser | null): Promise<ListServiceDto[]> {
    const where: any = { status: 'published' };
    if (minConcentration != null && !isNaN(minConcentration)) {
      where.concentration = MoreThanOrEqual(minConcentration);
    }

    const items = await this.titrationsRepo.find({
      where,
      order: { id: 'ASC' },
      relations: { creator: true },
    });

    const counts = await this.loadLikesCounts(items.map((t) => t.id));

    return items.map((t) =>
      serializeListService(t, counts.get(t.id) ?? 0, !!user && t.creator?.id === user.id),
    );
  }

  // ==========================================================================
  // Домен "Услуга" — лента (только опубликованные): ОДНА запись, первая по id.
  // Признак is_liked (1/0): текущий пользователь лайкнул эту услугу.
  // GET /api/titration_pairs/feed
  // ==========================================================================
  async feed(user: AuthUser | null): Promise<FeedServiceDto> {
    const item = await this.titrationsRepo.findOne({
      where: { status: 'published' },
      order: { id: 'ASC' },
    });
    if (!item) {
      throw new NotFoundException();
    }
    return this.toFeedDto(item, user);
  }

  // ==========================================================================
  // Домен "Услуга" — лента по id: одна запись (?next=true — следующая за ней)
  // GET /api/titration_pairs/feed/:id?next=true
  // ==========================================================================
  async feedItem(id: number, next: boolean, user: AuthUser | null): Promise<FeedServiceDto> {
    const current = await this.titrationsRepo.findOne({
      where: { id, status: 'published' },
    });
    if (!current) {
      throw new NotFoundException();
    }
    if (!next) {
      return this.toFeedDto(current, user);
    }

    const following = await this.titrationsRepo.findOne({
      where: { id: MoreThan(id), status: 'published' },
      order: { id: 'ASC' },
    });
    if (!following) {
      throw new NotFoundException();
    }
    return this.toFeedDto(following, user);
  }

  // ==========================================================================
  // Домен "Услуга" — получение черновика пользователя сессии (не более 1 записи,
  // id не указывается)
  // GET /api/titration_pairs/draft
  // ==========================================================================
  async getDraft(user: AuthUser): Promise<ServiceDto> {
    const draft = await this.titrationsRepo.findOne({
      where: { status: 'draft', creator: { id: user.id } },
      order: { id: 'DESC' },
      relations: { creator: true },
    });

    if (!draft) {
      throw new NotFoundException();
    }

    return this.toDto(draft);
  }

  // ==========================================================================
  // Домен "Услуга" — создание черновика + загрузка файлов в Minio.
  // Создатель заполняется автоматически пользователем из сессии.
  // POST /api/titration_pairs  (multipart: title, image, video)
  // ==========================================================================
  async createDraft(dto: CreateServiceDto, user: AuthUser, imageFile?: Express.Multer.File, videoFile?: Express.Multer.File): Promise<ServiceDto> {
    const safeTitle = (dto.title ?? '').trim();
    if (!safeTitle) {
      throw new BadRequestException();
    }

    // Названия файлов генерируются на латинице, сами файлы — в Minio,
    // в БД сохраняется только имя файла.
    const imageName = imageFile ? await this.saveFile(imageFile, 'img') : undefined;
    const videoName = videoFile ? await this.saveFile(videoFile, 'video') : undefined;

    const draft = this.titrationsRepo.create({
      title: safeTitle,
      description: null,
      status: 'draft',
      image_url: imageName ?? null,
      video_url: videoName ?? null,
      creator: { id: user.id },
    });

    await this.titrationsRepo.save(draft);
    return this.toDto(draft);
  }

  // ==========================================================================
  // Домен "Услуга" — замена картинки услуги (старое изображение удаляется).
  // PUT /api/titration_pairs/:id/image  (multipart: image) — приём по методичке MinIO
  // ==========================================================================
  async uploadImage(id: number, user: AuthUser, file?: Express.Multer.File): Promise<ServiceDto> {
    const item = await this.titrationsRepo.findOne({ where: { id }, relations: { creator: true } });
    if (!item || item.status === 'deleted') {
      throw new NotFoundException();
    }
    if (!this.canManage(item, user)) {
      throw new ForbiddenException();
    }
    if (!file) {
      throw new BadRequestException();
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException();
    }

    // Старое изображение удаляется из MinIO
    const oldName = this.fileNameOf(item.image_url);
    if (oldName) {
      try {
        await this.minio.removeObject(bucketName(), oldName);
      } catch (error) {
        console.warn('Не удалось удалить старое изображение из MinIO:', String(error));
      }
    }

    const newName = await this.saveFile(file, 'img');
    await this.titrationsRepo.update(id, { image_url: newName });

    const saved = await this.titrationsRepo.findOne({ where: { id } });
    return this.toDto(saved);
  }

  // ==========================================================================
  // Домен "Услуга" — обновление услуги; для черновика это одновременно
  // публикация (смена статуса draft -> published).
  // PUT /api/titration_pairs/:id
  // ==========================================================================
  async updateService(id: number, dto: UpdateServiceDto, user: AuthUser): Promise<ServiceDto> {
    const draft = await this.titrationsRepo.findOne({
      where: { id },
      relations: { creator: true },
    });

    if (!draft || draft.status === 'deleted') {
      throw new NotFoundException();
    }
    if (!this.canManage(draft, user)) {
      throw new ForbiddenException();
    }
    if (draft.status !== 'draft') {
      throw new BadRequestException();
    }

    const update: any = {
      status: 'published',
      formed_at: new Date(),
      // системное поле: заполняется, только если публикует модератор
      moderator_id: user.role === 'moderator' ? user.id : null,
    };
    // Разрешённые для изменения поля (системные не принимаются)
    if (dto.description != null) update.description = String(dto.description);
    if (dto.ph != null) update.ph = dto.ph;
    if (dto.concentration != null) update.concentration = dto.concentration;

    await this.titrationsRepo.update(id, update);

    const saved = await this.titrationsRepo.findOne({ where: { id } });
    return this.toDto(saved);
  }

  // ==========================================================================
  // Домен "Услуга" — удаление (только soft delete: status = 'deleted').
  // DELETE /api/titration_pairs/:id
  // ==========================================================================
  async deleteService(id: number, user: AuthUser): Promise<{ id: number }> {
    const item = await this.titrationsRepo.findOne({ where: { id }, relations: { creator: true } });
    if (!item || item.status === 'deleted') {
      throw new NotFoundException();
    }
    if (!this.canManage(item, user)) {
      throw new ForbiddenException();
    }

    await this.titrationsRepo.update(id, { status: 'deleted' });
    return { id };
  }

  // ==========================================================================
  // Домен "Услуга" — лайк от текущего пользователя.
  // POST /api/titration_pairs/:id/like  { value: 1 | 0 }
  // ==========================================================================
  async setLike(id: number, dto: LikeDto, user: AuthUser): Promise<{ liked: boolean; likes_count: number }> {
    const value = dto.value;

    const item = await this.titrationsRepo.findOne({ where: { id } });
    if (!item || item.status === 'deleted') {
      throw new NotFoundException();
    }

    const existing = await this.likesRepo.findOne({
      where: { user: { id: user.id }, titration: { id } },
    });

    if (value === 1) {
      // Поставить лайк (0 отменяет лайк)
      if (!existing) {
        await this.likesRepo.save(
          this.likesRepo.create({ user: { id: user.id }, titration: { id } }),
        );
      }
    } else if (value === 0) {
      // Отменить лайк
      if (existing) {
        await this.likesRepo.delete(existing.id);
      }
    }

    const likesCount = await this.likesRepo.count({ where: { titration: { id } } });
    return { liked: value === 1, likes_count: likesCount };
  }

  // ==========================================================================
  // Приватные помощники
  // ==========================================================================

  /** Модель -> базовый ServiceDto (с количеством лайков). */
  private async toDto(item: Titration): Promise<ServiceDto> {
    const likesCount = await this.likesRepo.count({ where: { titration: { id: item.id } } });
    return serializeService(item, likesCount);
  }

  /** Изменять и удалять услугу может её создатель или модератор. */
  private canManage(item: Titration, user: AuthUser): boolean {
    return item.creator?.id === user.id || user.role === 'moderator';
  }

  /** Модель -> запись ленты: базовые поля + is_liked текущего пользователя (у гостя 0). */
  private async toFeedDto(item: Titration, user: AuthUser | null): Promise<FeedServiceDto> {
    const likesCount = await this.likesRepo.count({ where: { titration: { id: item.id } } });
    const myLike = user
      ? await this.likesRepo.findOne({ where: { user: { id: user.id }, titration: { id: item.id } } })
      : null;

    return serializeFeedService(item, likesCount, !!myLike);
  }

  /** Количество лайков для списка id. */
  private async loadLikesCounts(ids: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (!ids.length) return map;

    const rows: any[] = await this.likesRepo
      .createQueryBuilder('l')
      .select('l.titration_id', 'tid')
      .addSelect('COUNT(l.id)', 'cnt')
      .where('l.titration_id IN (:...ids)', { ids })
      .groupBy('l.titration_id')
      .getRawMany();

    for (const r of rows) {
      map.set(Number(r.tid), Number(r.cnt));
    }
    return map;
  }

  /** Загрузка файла в Minio; возвращает имя файла латиницей. */
  private async saveFile(file: Express.Multer.File, prefix: 'img' | 'video'): Promise<string> {
    const ext = (file.originalname.match(/\.[a-zA-Z0-9]{1,5}$/) || [])[0] || '';
    const safeExt = /^\.[a-zA-Z0-9]{1,5}$/.test(ext) ? ext.toLowerCase() : prefix === 'img' ? '.jpg' : '.mp4';
    const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`;

    await this.minio.putObject(bucketName(), name, file.buffer);
    return name;
  }

  /** Извлекает имя файла из URL или имени, сохранённого в БД. */
  private fileNameOf(value: string | null | undefined): string | null {
    if (!value) return null;
    return value.split('/').pop() || null;
  }
}