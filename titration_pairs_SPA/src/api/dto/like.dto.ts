import { Type } from 'class-transformer';
import { IsIn, IsNumber } from 'class-validator';

/** DTO транзакции лайка: 1 — поставить, 0 — снять. */
export class LikeDto {
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  value: number;
}