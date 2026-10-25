import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** DTO регистрации нового пользователя (домен «Пользователь»). */
export class RegisterDto {
  @ApiProperty({ example: 'ivanov', description: 'Логин, уникальный', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username: string;

  @ApiProperty({ example: 'secret123', description: 'Пароль', minLength: 6, maxLength: 72 })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}
