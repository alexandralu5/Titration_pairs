import { Global, Module } from '@nestjs/common';
import { SessionService } from './session.service';

/** Глобальный модуль хранилища сессий (Redis). */
@Global()
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
