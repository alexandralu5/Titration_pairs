/// <reference types="multer" />
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import * as Minio from 'minio';

export interface TitrationPair {
  id: string;
  title: string;
  description: string;
  ph: number;
  concentration: number;
  imageUrl: string;
  image_url?: string;
  videoUrl: string;
  video_url?: string;
  status: 'draft' | 'published' | 'deleted';
  likesCount: number;
  likes?: string[];
}

@Injectable()
export class AppService implements OnModuleInit {
  private minioClient: Minio.Client;
  private bucketName = 'titration';
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      user: 'admin',
      host: 'localhost',
      database: 'titration_db',
      password: 'password',
      port: 5432,
    });

    this.minioClient = new Minio.Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'admin',
      secretKey: 'password',
    });
  }

  // Синхронизация счетчика автоинкремента PostgreSQL при старте модуля
  async onModuleInit() {
    try {
      await this.pool.query(
        `SELECT setval('titrations_id_seq', COALESCE((SELECT MAX(id) FROM titrations), 1));`
      );
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message); // TypeScript знает, что это Error
      } else {
        console.error('Неизвестная ошибка:', String(error));
      }
    }
  }

  private getFileUrl(filename: string): string {
    if (!filename) return '';
    return `http://localhost:9000/${this.bucketName}/${filename}`;
  }

  // Форматирование данных под любые варианты обращения в Handlebars шаблонах
  private formatPair(row: any): TitrationPair {
    const img = row.image_url || '/img/default-image.jpg';
    const vid = row.video_url || '/img/default-video.mp4';
    const likesCount = parseInt(row.likes_count || '0', 10);

    return {
      ...row,
      id: String(row.id),
      title: row.title || '',
      description: row.description || '',
      ph: row.ph !== null && row.ph !== undefined ? parseFloat(row.ph) : 7.0,
      concentration: row.concentration !== null && row.concentration !== undefined ? parseFloat(row.concentration) : 0.1,
      imageUrl: img,
      image_url: img,
      videoUrl: vid,
      video_url: vid,
      status: row.status,
      likesCount: likesCount,
      likes: new Array(likesCount).fill('user'),
    };
  }

  // 1. Получение или создание черновика в БД PostgreSQL
  async getDraft() {
    const res = await this.pool.query(
      `SELECT t.*, COUNT(l.id) as likes_count
       FROM titrations t
       LEFT JOIN likes l ON t.id = l.titration_id
       WHERE t.status = 'draft'
       GROUP BY t.id
       LIMIT 1`
    );

    if (res.rows.length > 0) {
      return this.formatPair(res.rows[0]);
    }

    // Автоматическая коррекция счетчика перед вставкой
    await this.onModuleInit();

    const newDraft = await this.pool.query(
      `INSERT INTO titrations (title, description, status, ph, concentration, creator_id, image_url, video_url)
       VALUES ('Новый опыт', '', 'draft', 7.0, 0.10, 1, '/img/default-image.jpg', '/img/default-video.mp4')
       RETURNING *`
    );

    return this.formatPair(newDraft.rows[0]);
  }

  // 2. Выборка опубликованных записей из БД
  async getPublished(minConcentration?: string) {
    let query = `
      SELECT t.*, COUNT(l.id) as likes_count
      FROM titrations t
      LEFT JOIN likes l ON t.id = l.titration_id
      WHERE t.status = 'published'
    `;
    const params: any[] = [];

    if (minConcentration && !isNaN(parseFloat(minConcentration))) {
      params.push(parseFloat(minConcentration));
      query += ` AND t.concentration >= $${params.length}`;
    }

    query += ` GROUP BY t.id ORDER BY t.id ASC`;

    const res = await this.pool.query(query, params);
    return res.rows.map(row => this.formatPair(row));
  }

  // 3. Выборка данных для ленты с поддержкой 404
  async getFeedData(id?: string) {
    const published = await this.getPublished();
    if (published.length === 0) {
      return { item: null, nextId: '', currentIndex: 0, totalCount: 0 };
    }

    let currentIndex = 0;

    if (id) {
      currentIndex = published.findIndex(p => String(p.id) === String(id));
      if (currentIndex === -1) {
        return null; // Возвращает null для генерации NotFoundException (404)
      }
    }

    const currentItem = published[currentIndex];
    const nextIndex = (currentIndex + 1) % published.length;
    const nextId = published[nextIndex].id;

    return {
      item: currentItem,
      nextId: nextId,
      currentIndex: currentIndex + 1,
      totalCount: published.length,
    };
  }

  // 4. Публикация черновика
  async publishDraft(body: any, imageFile?: Express.Multer.File, videoFile?: Express.Multer.File) {
    let imageUrl = body.image_url || '/img/default-image.jpg';
    let videoUrl = body.video_url || '/img/default-video.mp4';

    if (imageFile) {
      const imgName = `${Date.now()}-${imageFile.originalname}`;
      await this.minioClient.putObject(this.bucketName, imgName, imageFile.buffer);
      imageUrl = this.getFileUrl(imgName);
    }

    if (videoFile) {
      const vidName = `${Date.now()}-${videoFile.originalname}`;
      await this.minioClient.putObject(this.bucketName, vidName, videoFile.buffer);
      videoUrl = this.getFileUrl(vidName);
    }

    const ph = body.ph ? parseFloat(body.ph) : 7.0;
    const concentration = body.concentration ? parseFloat(body.concentration) : 0.1;
    const title = body.title || 'Новый опыт';
    const description = body.description || '';

    if (body.id) {
      const numericId = Number(body.id);
      await this.pool.query(
        `UPDATE titrations
         SET title = $1, description = $2, ph = $3, concentration = $4, status = 'published', formed_at = NOW(),
             image_url = CASE WHEN $5 <> '/img/default-image.jpg' THEN $5 ELSE image_url END,
             video_url = CASE WHEN $6 <> '/img/default-video.mp4' THEN $6 ELSE video_url END
         WHERE id = $7`,
        [title, description, ph, concentration, imageUrl, videoUrl, numericId]
      );
    } else {
      await this.onModuleInit();
      await this.pool.query(
        `INSERT INTO titrations (title, description, ph, concentration, status, creator_id, image_url, video_url, formed_at)
         VALUES ($1, $2, $3, $4, 'published', 1, $5, $6, NOW())`,
        [title, description, ph, concentration, imageUrl, videoUrl]
      );
    }
  }

  // 5. Логическое удаление карточки в PostgreSQL
  async deletePair(id: string | number) {
    const numericId = Number(id);
    if (isNaN(numericId)) return;

    await this.pool.query(
      `UPDATE titrations SET status = 'deleted' WHERE id = $1`,
      [numericId]
    );
  }
}
