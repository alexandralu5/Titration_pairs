import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from './user.entity';
import { Titration } from './titration.entity';

/**
 * Модель "Лайк" (ORM-сущность TypeORM) — связующая между
 * пользователями и опытами. Отображается на таблицу likes.
 *
 * Ограничения, зафиксированные на уровне модели (а не только в коде):
 *  - @Unique(['user', 'titration']) — один пользователь не может поставить
 *    больше одного лайка одному опыту;
 *  - оба внешних ключа объявлены с onDelete: 'RESTRICT', поэтому удалить
 *    пользователя или опыт, у которого есть лайки, нельзя.
 *
 * Количество лайков не хранится счётчиком, а подсчитывается запросом
 * COUNT при сериализации (см. loadLikesCounts в api.service.ts).
 */
@Entity('likes')
@Unique(['user', 'titration']) // Один пользователь не может поставить больше одного лайка одному опыту
export class Like {
  @PrimaryGeneratedColumn()
  id: number;

  // Связь с пользователем (Foreign Key: user_id)
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Связь с карточкой опыта (Foreign Key: titration_id)
  @ManyToOne(() => Titration, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'titration_id' })
  titration: Titration;
}
