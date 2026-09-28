import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiModule } from './api/api.module';
import { Titration } from './titration/entities/titration.entity';
import { User } from './titration/entities/user.entity';
import { Like } from './titration/entities/like.entity';

@Module({
  imports: [
    // Конфигурация из .env (как в методичке, секция 4.5/5)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // ORM-подключение к БД (TypeORM) через ConfigService.
    // Схема управляется вручную (synchronize: false / 'false' из .env).
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: parseInt(config.get<string>('DB_PORT') || '5432', 10),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        entities: [Titration, User, Like],
        synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
        logging: config.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    // REST-веб-сервис /api для SPA (домены "Услуга" и "Пользователь")
    ApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}