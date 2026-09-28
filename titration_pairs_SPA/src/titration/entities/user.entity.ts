import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Модель "Пользователь" (ORM-сущность TypeORM).
 * Отображается на таблицу users.
 *
 * Модель намеренно минимальная: логина и пароля нет,
 * полноценная авторизация не входит в объём лабораторной.
 * Текущий пользователь задан константой через singleton-функцию
 * currentUser() (см. src/api/current-user.ts), поэтому в сущности
 * достаточно идентификатора и имени.
 *
 * Связи: пользователь является автором опытов (titrations.creator)
 * и автором лайков (likes.user).
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  username: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
