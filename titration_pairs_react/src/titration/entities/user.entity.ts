import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Модель "Пользователь" (ORM-сущность TypeORM).
 * Отображается на таблицу users.
 *
 *  - username — логин, уникальный;
 *  - password — НЕ пароль, а его хеш (scrypt, см. src/auth/password.ts).
 *    Колонка объявлена с select: false, поэтому в обычные выборки не попадает
 *    и наружу случайно не уйдёт; читается явно только при входе;
 *  - role — 'user' (по умолчанию) или 'moderator'.
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

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  password: string;

  @Column({ type: 'varchar', length: 20, default: 'user' })
  role: string; // 'user' | 'moderator'

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
