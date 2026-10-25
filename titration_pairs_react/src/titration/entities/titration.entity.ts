import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from './user.entity';

/**
 * Модель "Опыт" (ORM-сущность TypeORM) — центральная сущность проекта.
 * Отображается на таблицу titrations.
 *
 * Разделение полей на три группы:
 *  1. Бизнес-поля приходят от клиента: title, description, ph, concentration.
 *  2. Системные поля вычисляются на бэкенде и клиенту НЕ отдаются
 *     (помечены @Exclude и дополнительно вырезаются в serializers.ts):
 *     status, creator, moderator_id, created_at, formed_at.
 *  3. Медиа-поля image_url / video_url содержат ИМЯ файла в MinIO,
 *     а не путь; публичный URL собирается в сериализаторе fileUrl().
 *
 * Жизненный цикл записи: 'draft' -> 'published' -> 'deleted' (soft delete).
 * Статус нельзя менять произвольно: смена выполняется только двумя методами
 * (POST create -> draft, PUT publish -> published), вернуться в draft нельзя.
 */
@Entity('titrations')
export class Titration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string; // 'draft' | 'published' | 'deleted'

  @Column({ type: 'varchar', length: 255, nullable: true })
  image_url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  video_url: string;

  @Column({ type: 'float', nullable: true })
  ph: number;

  @Column({ type: 'float', nullable: true })
  concentration: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  formed_at: Date;

  // Системные поля скрываем при JSON-сериализации сущности (ClassSerializerInterceptor)
  @Exclude()
  @Column({ type: 'int', nullable: true })
  moderator_id: number;

  // Каскадное удаление запрещено (RESTRICT)
  @Exclude()
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'creator_id' })
  creator: User;
}
