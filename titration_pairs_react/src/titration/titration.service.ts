import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Titration } from './entities/titration.entity';
import { User } from './entities/user.entity';

@Injectable()
export class TitrationService {
  constructor(
    @InjectRepository(Titration) private titrationsRepo: Repository<Titration>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // 1. Получение опубликованных с дефолтными медиа
  async getPublishedGrid(): Promise<Titration[]> {
    const records = await this.titrationsRepo.find({ where: { status: 'published' } });
    return records.map((t) => this.applyDefaultMedia(t));
  }

  // 2. Получение одного опыта (поиск по ID)
  async getTitrationById(id: number): Promise<Titration | null> {
    const record = await this.titrationsRepo.findOne({ where: { id, status: 'published' } });
    return record ? this.applyDefaultMedia(record) : null;
  }

  // 3. Получение черновика (исправлен тип relations на { creator: true })
  async getDraft(userId: number): Promise<Titration | null> {
    const draft = await this.titrationsRepo.findOne({
      where: { creator: { id: userId }, status: 'draft' },
      relations: { creator: true }
    });
    return draft ? this.applyDefaultMedia(draft) : null;
  }

  // 4. Создание черновика (ORM) - Кнопка "Далее"
  async createDraft(userId: number, title: string, img: string, vid: string): Promise<void> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return;

    const draft = this.titrationsRepo.create({
      title,
      image_url: img,
      video_url: vid,
      status: 'draft',
      creator: user
    });

    await this.titrationsRepo.save(draft);
  }

  // 5. Публикация черновика (ORM) - Кнопка "Опубликовать"
  async publishDraft(id: number, desc: string, ph: number, conc: number): Promise<void> {
    await this.titrationsRepo.update(id, {
      description: desc,
      ph,
      concentration: conc,
      status: 'published',
      formed_at: new Date()
    });
  }

  // 6. Логическое удаление через чистый SQL (без ORM)
  async deleteSQL(id: number): Promise<void> {
    await this.titrationsRepo.query(
      `UPDATE titrations SET status = $1 WHERE id = $2`,
      ['deleted', id]
    );
  }

  // Установка дефолтных медиафайлов из SSR при отсутствии
  private applyDefaultMedia(t: Titration): Titration {
    if (!t.image_url) t.image_url = '/img/default-image.jpg';
    if (!t.video_url) t.video_url = '/img/default-video.mp4';
    return t;
  }
}
