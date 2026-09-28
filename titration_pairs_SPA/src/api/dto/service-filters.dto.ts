import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

/** DTO фильтров списка услуг (query-параметры). */
export class ServiceFiltersDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  minConcentration?: number;
}