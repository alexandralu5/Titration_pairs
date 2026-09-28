import { IsNotEmpty, IsString } from 'class-validator';

/** DTO создания черновика. Системные поля (id, status, creator, даты) с клиента НЕ принимаются. */
export class CreateServiceDto {
  @IsString()
  @IsNotEmpty({ message: 'Название услуги обязательно' })
  title: string;
}