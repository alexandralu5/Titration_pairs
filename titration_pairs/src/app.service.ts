/// <reference types="multer" />
import { Injectable } from '@nestjs/common';
import * as Minio from 'minio';

export interface TitrationPair {
  id: string;
  title: string;
  description: string;
  ph: number;
  concentration: number;
  imageUrl: string;
  videoUrl: string;
  status: 'draft' | 'published' | 'deleted';
  likes: string[];
}

@Injectable()
export class AppService {
  private minioClient: Minio.Client;
  private bucketName = 'titration';

  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'admin',
      secretKey: 'password',
    });
  }

  private getFileUrl(filename: string): string {
    if (!filename) return '';
    return `http://localhost:9000/${this.bucketName}/${filename}`;
  }

  private titration_pairs: TitrationPair[] = [
    {
      id: '1',
      title: 'HCl + NaOH (Сильная к-та / Сильная щелочь)',
      description: 'Точка эквивалентности находится точно при pH 7.0. Классический кристальный скачок.',
      ph: 7.0,
      concentration: 0.1,
      imageUrl: 'http://localhost:9000/titration/image1.jpg',
      videoUrl: 'http://localhost:9000/titration/video6.mp4',
      status: 'published',
      likes: ['user1', 'user2', 'user3', 'user4']
    },
    {
      id: '2',
      title: 'CH3COOH + NaOH (Слабая к-та / Сильная щелочь)',
      description: 'Скачок титрования в щелочной среде (pH 8.7). Индикатор — фенолфталеин.',
      ph: 8.7,
      concentration: 0.05,
      imageUrl: 'http://localhost:9000/titration/image2.jpg',
      videoUrl: 'http://localhost:9000/titration/video2.mp4',
      status: 'published',
      likes: ['user1', 'user5']
    },
    {
      id: '3',
      title: 'HNO3 + KOH (Азотная кислота и гидроксид калия)',
      description: 'Полная нейтрализация с выделением тепла. Нейтральная среда в точке эквивалентности.',
      ph: 7.0,
      concentration: 0.2,
      imageUrl: 'http://localhost:9000/titration/image3.jpg',
      videoUrl: 'http://localhost:9000/titration/video3.mp4',
      status: 'published',
      likes: ['user2', 'user3', 'user6', 'user7', 'user8']
    },
    {
      id: '4',
      title: 'H2SO4 + NH3 (Серная кислота и аммиак)',
      description: 'Титрование слабой щелочью. Точка эквивалентности смещена в кислую область (pH 5.2).',
      ph: 5.2,
      concentration: 0.15,
      imageUrl: 'http://localhost:9000/titration/image4.jpg',
      videoUrl: 'http://localhost:9000/titration/video4.mp4',
      status: 'published',
      likes: ['user1']
    },
    {
      id: '5',
      title: 'HCOOH + NaOH (Муравьиная кислота и гидроксид натрия)',
      description: 'Титрование одноосновной органической кислоты с розоватым переходом фенолфталеина.',
      ph: 8.3,
      concentration: 0.08,
      imageUrl: 'http://localhost:9000/titration/image5.jpg',
      videoUrl: 'http://localhost:9000/titration/video5.mp4',
      status: 'published',
      likes: ['user3', 'user4', 'user9']
    },
    {
      id: '6',
      title: 'H2C2O4 + KMnO4 (Перманганатометрия щавелевой кислоты)',
      description: 'Редокс-титрование без постороннего индикатора. Разрушение розоватого перманганата.',
      ph: 1.5,
      concentration: 0.25,
      imageUrl: 'http://localhost:9000/titration/image6.jpg',
      videoUrl: 'http://localhost:9000/titration/video1.mp4',
      status: 'published',
      likes: ['user1', 'user2']
    },
    {
      id: '7',
      title: 'Титрование NaOH раствором H₂SO₄ (сильное основание + сильная кислота)',
      description: 'Раствор серной кислоты титруют раствором гидроксида натрия. ',
      ph: 7.0,
      concentration: 0.0625,
      imageUrl: 'http://localhost:9000/titration/image7.jpg',
      videoUrl: 'http://localhost:9000/titration/video6.mp4',
      status: 'draft',
      likes: []
    },
    {
      id: '8',
      title: 'Удаленный архивный опыт',
      description: 'Этот опыт был забракован и удален.',
      ph: 4.0,
      concentration: 0.5,
      imageUrl: 'http://localhost:9000/titration/image8.jpg',
      videoUrl: '',
      status: 'deleted',
      likes: []
    }
  ];

  getDraft(): TitrationPair | undefined {
    return this.titration_pairs.find(p => p.status === 'draft');
  }

  getPublished(minConcentration?: string): TitrationPair[] {
    let published = this.titration_pairs.filter(p => p.status === 'published');
    if (minConcentration) {
      const minVal = parseFloat(minConcentration);
      if (!isNaN(minVal)) {
        published = published.filter(p => p.concentration >= minVal);
      }
    }
    return published;
  }

  getFeedData(id?: string) {
    const published = this.getPublished();
    let currentIndex = published.findIndex(p => p.id === id);
    if (currentIndex === -1) currentIndex = 0;

    const currentItem = published[currentIndex];
    const nextIndex = (currentIndex + 1) % published.length;
    const nextId = published[nextIndex].id;

    return {
      item: currentItem,
      nextId: nextId,
      currentIndex: currentIndex + 1,
      totalCount: published.length
    };
  }

  async updateDraftWithFiles(imageFile?: Express.Multer.File, videoFile?: Express.Multer.File) {
    const draft = this.getDraft();
    if (!draft) return;

    if (imageFile) {
      const imgName = `${Date.now()}-${imageFile.originalname}`;
      await this.minioClient.putObject(this.bucketName, imgName, imageFile.buffer);
      draft.imageUrl = this.getFileUrl(imgName);
    }

    if (videoFile) {
      const vidName = `${Date.now()}-${videoFile.originalname}`;
      await this.minioClient.putObject(this.bucketName, vidName, videoFile.buffer);
      draft.videoUrl = this.getFileUrl(vidName);
    }
  }
}
