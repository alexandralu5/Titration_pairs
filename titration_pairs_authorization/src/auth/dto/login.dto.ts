import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** DTO аутентификации (домен «Пользователь»). */
export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Логин' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username: string;

  @ApiProperty({ example: 'admin123', description: 'Пароль' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
