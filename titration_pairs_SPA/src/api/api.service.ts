import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import * as Minio from 'minio';
import { Titration } from '../titration/entities/titration.entity';
import { User } from '../titration/entities/user.entity';
import { Like } from '../titration/entities/like.entity';
import { currentUser } from './current-user';
import { serializeService, serializeUser, ServiceDto, UserDto } from './serializers';
import { bucketName, MINIO_CLIENT } from './minio.provider';
import { CreateServiceDto } from './dto/create-service.dto';
import { PublishServiceDto } from './dto/publish-service.dto';
import { LikeDto } from './dto/like.dto';
import { RegisterUserDto } from './dto/register-user.dto';

/**
 * Домен "Услуга/опыт" + "Пользователь".
 *
 * Бизнес-логика:
 *  - записи со статусом 'deleted' клиенту НЕ возвращаются;
 *  - статусы нельзя менять "с любого на любой": только создатель через
 *    два метода (POST create → draft, PUT publish → published), вернуться
 *    в черновик нельзя;
 *  - системные поля (id, status, creator, moderator, даты) не принимаются
 *    от клиента — вычисляются на бэкенде;
 *  - текущий пользователь (создатель) задан константой через currentUser().
 */
@Injectable()
export class ApiService {
  constructor(
    @InjectRepository(Titration) private readonly titrationsRepo: Repository<Titration>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Like) private readonly likesRepo: Repository<Like>,
    @Inject(MINIO_CLIENT) private readonly minio: Minio.Client,
  ) {}

  // ==========================================================================
  // Домен "Услуга" — список с фильтрацией (только опубликованные)
  // GET /api/services?minConcentration=0.1
  // ==========================================================================
  async listServices(minConcentration?: number): Promise<ServiceDto[]> {
    const where: any = { status: 'published' };
    if (minConcentration != null && !isNaN(minConcentration)) {
      where.concentration = MoreThanOrEqual(minConcentration);
    }

    const items = await this.titrationsRepo.find({
      where,
      order: { id: 'ASC' },
    });

    const counts = await this.loadLikesCounts(items.map((t) => t.id));

    return items.map((t) => serializeService(t, counts.get(t.id) ?? 0));
  }

  // ==========================================================================
  // Домен "Услуга" — лента (только опубликованные)
  // GET /api/services/feed
  // ==========================================================================
  async feed(): Promise<ServiceDto[]> {
    return this.listServices();
  }

  // ==========================================================================
  // Домен "Услуга" — лента по id (?next=true)
  // GET /api/services/feed/:id?next=true
  // ==========================================================================
  async feedItem(id: number, next: boolean): Promise<ServiceDto> {
    const items = await this.feed();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) {
      throw new NotFoundException(`Услуга с id=${id} не найдена или удалена`);
    }
    const target = next ? items[idx + 1] : items[idx];
    if (!target) {
      throw new NotFoundException('Дальше в ленте записей нет');
    }
    return target;
  }

  // ==========================================================================
  // Домен "Услуга" — получение черновика (не более 1 записи, id не указывается)
  // GET /api/services/draft
  // ==========================================================================
  async getDraft(): Promise<ServiceDto> {
    const user = currentUser(); // Singleton-функция с константой пользователя

    const draft = await this.titrationsRepo.findOne({
      where: { status: 'draft', creator: { id: user.id } },
      order: { id: 'DESC' },
      relations: { creator: true },
    });

    if (!draft) {
      throw new NotFoundException('Черновик не найден');
    }

    const likesCount = await this.likesRepo.count({
      where: { titration: { id: draft.id } },
    });

    return serializeService(draft, likesCount);
  }

  // ==========================================================================
  // Домен "Услуга" — создание черновика + загрузка файлов в Minio.
  // POST /api/services  (multipart: title, image, video)
  // ==========================================================================
  async createDraft(dto: CreateServiceDto, imageFile?: Express.Multer.File, videoFile?: Express.Multer.File): Promise<ServiceDto> {
    const user = currentUser();

    const safeTitle = (dto.title ?? '').trim();
    if (!safeTitle) {
      throw new BadRequestException('Название услуги обязательно');
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
    return serializeService(draft, 0);
  }

  // ==========================================================================
  // Домен "Услуга" — замена картинки услуги (старое изображение удаляется).
  // POST /api/services/:id/image  (multipart: image) — приём по методичке MinIO
  // ==========================================================================
  async uploadImage(id: number, file?: Express.Multer.File): Promise<ServiceDto> {
    const user = currentUser();

    const item = await this.titrationsRepo.findOne({ where: { id }, relations: { creator: true } });
    if (!item || item.status === 'deleted') {
      throw new NotFoundException(`Услуга с id=${id} не найдена или удалена`);
    }
    if (item.creator?.id !== user.id) {
      throw new ForbiddenException('Менять файлы может только создатель');
    }
    if (!file) {
      throw new BadRequestException('Файл изображения не предоставлен');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Файл должен быть изображением');
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

    const likesCount = await this.likesRepo.count({ where: { titration: { id } } });
    const saved = await this.titrationsRepo.findOne({ where: { id } });
    return serializeService(saved, likesCount);
  }

  // ==========================================================================
  // Домен "Услуга" — публикация (смена статуса draft -> published).
  // PUT /api/services/:id/publish
  // ==========================================================================
  async publishDraft(id: number, dto: PublishServiceDto): Promise<ServiceDto> {
    const user = currentUser();

    const draft = await this.titrationsRepo.findOne({
      where: { id },
      relations: { creator: true },
    });

    if (!draft || draft.status === 'deleted') {
      throw new NotFoundException(`Услуга с id=${id} не найдена или удалена`);
    }
    if (draft.creator?.id !== user.id) {
      throw new ForbiddenException('Публиковать может только создатель');
    }
    if (draft.status !== 'draft') {
      throw new BadRequestException('Опубликовать можно только черновик (вернуться в черновик нельзя)');
    }

    const update: any = {
      status: 'published',
      formed_at: new Date(),
      moderator_id: user.id, // системное поле, вычисляется на бэкенде
    };
    // Разрешённые для изменения поля (системные не принимаются)
    if (dto.description != null) update.description = String(dto.description);
    if (dto.ph != null) update.ph = dto.ph;
    if (dto.concentration != null) update.concentration = dto.concentration;

    await this.titrationsRepo.update(id, update);

    const likesCount = await this.likesRepo.count({ where: { titration: { id } } });
    const saved = await this.titrationsRepo.findOne({ where: { id } });
    return serializeService(saved, likesCount);
  }

  // ==========================================================================
  // Домен "Услуга" — удаление (только soft delete: status = 'deleted').
  // DELETE /api/services/:id
  // ==========================================================================
  async deleteService(id: number): Promise<{ id: number; status: string }> {
    const user = currentUser();

    const item = await this.titrationsRepo.findOne({ where: { id }, relations: { creator: true } });
    if (!item || item.status === 'deleted') {
      throw new NotFoundException(`Услуга с id=${id} не найдена или уже удалена`);
    }
    if (item.creator?.id !== user.id) {
      throw new ForbiddenException('Удалять может только создатель');
    }

    await this.titrationsRepo.update(id, { status: 'deleted' });
    return { id, status: 'deleted' };
  }

  // ==========================================================================
  // Домен "Услуга" — лайк от текущего пользователя.
  // POST /api/services/:id/like  { value: 1 | 0 }
  // ==========================================================================
  async setLike(id: number, dto: LikeDto): Promise<{ liked: boolean; likes_count: number }> {
    const user = currentUser();
    const value = dto.value;

    const item = await this.titrationsRepo.findOne({ where: { id } });
    if (!item || item.status === 'deleted') {
      throw new NotFoundException(`Услуга с id=${id} не найдена или удалена`);
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
  // Домен "Пользователь" — регистрация.
  // POST /api/users/register
  // ==========================================================================
  async register(dto: RegisterUserDto): Promise<UserDto> {
    const safeName = (dto.username ?? '').trim();
    if (!safeName) {
      throw new BadRequestException('Имя пользователя обязательно');
    }

    const exists = await this.usersRepo.findOne({ where: { username: safeName } });
    if (exists) {
      throw new ConflictException(`Пользователь "${safeName}" уже зарегистрирован`);
    }

    const user = this.usersRepo.create({ username: safeName });
    await this.usersRepo.save(user);
    return serializeUser(user);
  }

  // ==========================================================================
  // Домен "Пользователь" — аутентификация (заглушка для 4-й лабораторной).
  // POST /api/users/login
  // ==========================================================================
  async login(body: any): Promise<{ message: string; stub: boolean }> {
    return { message: 'Заглушка аутентификации (лабораторная №4)', stub: true };
  }

  // ==========================================================================
  // Домен "Пользователь" — деавторизация (заглушка для 4-й лабораторной).
  // POST /api/users/logout
  // ==========================================================================
  async logout(): Promise<{ message: string; stub: boolean }> {
    return { message: 'Заглушка деавторизации (лабораторная №4)', stub: true };
  }

  // ==========================================================================
  // Приватные помощники
  // ==========================================================================

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