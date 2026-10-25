import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * DTO обновления услуги: PUT /api/titration_pairs/:id
 * (обновление черновика одновременно публикует его — draft -> published).
 * Принимаются только разрешённые поля предметной области.
 * Смена статуса, модератор и дата формирования вычисляются на бэкенде.
 */
export class UpdateServiceDto {
  @ApiPropertyOptional({ example: 'Точка эквивалентности при pH 7.0' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 7, minimum: 0, maximum: 14 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(14)
  @IsOptional()
  ph?: number;

  @ApiPropertyOptional({ example: 0.1, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  concentration?: number;
}
