import { IsNotEmpty, IsString } from 'class-validator';

/** DTO регистрации нового пользователя (домен «Пользователь»). */
export class RegisterUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Имя пользователя обязательно' })
  username: string;
}