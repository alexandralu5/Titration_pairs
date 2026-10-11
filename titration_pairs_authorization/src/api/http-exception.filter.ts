import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Единый формат ответа с ошибкой.
 *
 * По требованиям лабораторной в теле JSON ошибки не должно быть ни
 * statusCode, ни error, ни message: клиент смотрит только на HTTP-код
 * ответа (404, потом 403, 400 для невалидных данных, 200/201 для успеха).
 *
 * Поэтому фильтр перехватывает ВСЁ — в том числе ошибки ValidationPipe,
 * ParseIntPipe, файловых фильтров и стандартный 404 Nest — и отдаёт
 * стандартный HTTP-код с пустым объектом {}.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // В лог пишем подробности, клиенту — нет: текст ошибки наружу не уходит.
    if (exception instanceof HttpException) {
      this.logger.warn(`${status} ${exception.name}`);
    } else {
      this.logger.error(exception);
    }

    response.status(status).json({});
  }
}
