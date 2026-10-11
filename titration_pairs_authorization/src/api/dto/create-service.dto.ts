import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** DTO создания черновика. Системные поля (id, status, creator, даты) с клиента НЕ принимаются. */
export class CreateServiceDto {
  @ApiProperty({ example: 'HCl + NaOH' })
  @IsString()
  @IsNotEmpty()
  title: string;
}