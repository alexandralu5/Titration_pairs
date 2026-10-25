import type { TitrationPair } from './titrationApi'

// Mock-коллекция опубликованных услуг (данные из лабораторной работы №1).
// У последней услуги пустые image_url и video_url — для неё показываются
// изображение и видео по умолчанию из public/.
export const TITRATION_PAIRS_MOCK: TitrationPair[] = [
  {
    id: 1,
    title: 'HCl + NaOH (Сильная к-та / Сильная щелочь)',
    description: 'Точка эквивалентности находится точно при pH 7.0. Классический кристальный скачок.',
    ph: 7.0,
    concentration: 0.1,
    image_url: 'http://localhost:9000/titration/image1.jpg',
    video_url: 'http://localhost:9000/titration/video6.mp4',
    likes_count: 4,
  },
  {
    id: 2,
    title: 'CH3COOH + NaOH (Слабая к-та / Сильная щелочь)',
    description: 'Скачок титрования в щелочной среде (pH 8.7). Индикатор — фенолфталеин.',
    ph: 8.7,
    concentration: 0.05,
    image_url: 'http://localhost:9000/titration/image2.jpg',
    video_url: 'http://localhost:9000/titration/video2.mp4',
    likes_count: 2,
  },
  {
    id: 3,
    title: 'HNO3 + KOH (Азотная кислота и гидроксид калия)',
    description: 'Полная нейтрализация с выделением тепла. Нейтральная среда в точке эквивалентности.',
    ph: 7.0,
    concentration: 0.2,
    image_url: 'http://localhost:9000/titration/image3.jpg',
    video_url: 'http://localhost:9000/titration/video3.mp4',
    likes_count: 5,
  },
  {
    id: 4,
    title: 'H2SO4 + NH3 (Серная кислота и аммиак)',
    description: 'Титрование слабой щелочью. Точка эквивалентности смещена в кислую область (pH 5.2).',
    ph: 5.2,
    concentration: 0.15,
    image_url: 'http://localhost:9000/titration/image4.jpg',
    video_url: 'http://localhost:9000/titration/video4.mp4',
    likes_count: 1,
  },
  {
    id: 5,
    title: 'HCOOH + NaOH (Муравьиная кислота и гидроксид натрия)',
    description: 'Титрование одноосновной органической кислоты с розоватым переходом фенолфталеина.',
    ph: 8.3,
    concentration: 0.08,
    image_url: 'http://localhost:9000/titration/image5.jpg',
    video_url: 'http://localhost:9000/titration/video5.mp4',
    likes_count: 3,
  },
  {
    id: 6,
    title: 'H2C2O4 + KMnO4 (Перманганатометрия щавелевой кислоты)',
    description: 'Редокс-титрование без постороннего индикатора. Разрушение розоватого перманганата.',
    ph: 1.5,
    concentration: 0.25,
    image_url: '',
    video_url: '',
    likes_count: 2,
  },
]
