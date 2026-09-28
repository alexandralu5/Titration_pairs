import * as Minio from 'minio';

/**
 * Провайдер Minio-клиента (объектное хранилище, S3-совместимое).
 * Объект создаётся один раз и внедряется в ApiService.
 * Фабрика асинхронная: при старте проверяет/создаёт бакет (как в методичке).
 */
export const MINIO_CLIENT = 'MINIO_CLIENT';

/** Имя бакета (читается на лету, чтобы .env успел загрузиться). */
export function bucketName(): string {
  return process.env.MINIO_BUCKET || 'titration';
}

export const minioClientProvider = {
  provide: MINIO_CLIENT,
  useFactory: async (): Promise<Minio.Client> => {
    const client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY || 'root',
      secretKey: process.env.MINIO_SECRET_KEY || 'rootpassword',
    });

    // Бакет создаётся автоматически, если его ещё нет
    const bucket = bucketName();
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket, 'us-east-1');
      console.log(`Бакет "${bucket}" создан в MinIO`);
    }

    return client;
  },
};