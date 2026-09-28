import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'admin',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'titration_db',
});

async function run() {
  try {
    await dataSource.initialize();
    console.log('Подключение к PostgreSQL установлено.');

    const sqlPath = path.join(__dirname, 'seed.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await dataSource.query(sql);
    console.log('Схема и тестовые карточки опытов успешно загружены в БД.');

    await dataSource.destroy();
    process.exit(0);
  } catch (err) {
    console.error('Ошибка при выполнении миграции:', err);
    process.exit(1);
  }
}

run();
