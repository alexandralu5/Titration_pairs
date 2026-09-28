import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * DTO публикации (смена статуса draft -> published).
 * Принимаются только разрешённые поля предметной области.
 * Смена статуса, модератор и дата формирования вычисляются на бэкенде.
 */
export class PublishServiceDto {
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