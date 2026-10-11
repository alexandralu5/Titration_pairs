import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * DTO обновления услуги: PUT /api/titration_pairs/:id
 * (обновление черновика одновременно публикует его — draft -> published).
 * Принимаются только разрешённые поля предметной области.
 * Смена статуса, модератор и дата формирования вычисляются на бэкенде.
 */
export class UpdateServiceDto {
  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(14)
  @IsOptional()
  ph?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  concentration?: number;
}
