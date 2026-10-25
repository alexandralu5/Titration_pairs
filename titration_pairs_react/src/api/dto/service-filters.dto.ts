import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

/** DTO фильтров списка услуг (query-параметры). */
export class ServiceFiltersDto {
  @ApiPropertyOptional({ example: 0.1, minimum: 0, description: 'Минимальная концентрация, М' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  minConcentration?: number;
}