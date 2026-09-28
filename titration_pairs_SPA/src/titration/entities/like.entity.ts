import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from './user.entity';
import { Titration } from './titration.entity';

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
