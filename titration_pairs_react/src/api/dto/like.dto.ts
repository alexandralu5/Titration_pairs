import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber } from 'class-validator';

/** DTO транзакции лайка: 1 — поставить, 0 — снять. */
export class LikeDto {
  @ApiProperty({ enum: [0, 1], example: 1, description: '1 — поставить лайк, 0 — снять' })
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  value: number;
}