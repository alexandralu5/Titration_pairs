-- Таблица пользователей
-- password — хеш пароля (scrypt), сам пароль в БД не хранится;
-- role — 'user' или 'moderator'.
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Обновление базы, созданной до лабораторной №4 (колонок авторизации ещё нет)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Таблица опытов титрования
CREATE TABLE IF NOT EXISTS titrations (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    image_url VARCHAR(255),
    video_url VARCHAR(255),
    ph REAL,
    concentration REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    formed_at TIMESTAMP,
    creator_id INT NOT NULL,
    moderator_id INT,
    CONSTRAINT fk_creator FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE RESTRICT
);

ALTER TABLE titrations ADD COLUMN IF NOT EXISTS moderator_id INT;

-- Таблица лайков
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    titration_id INT NOT NULL,
    CONSTRAINT fk_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_like_titration FOREIGN KEY (titration_id) REFERENCES titrations(id) ON DELETE RESTRICT,
    CONSTRAINT unique_user_titration UNIQUE (user_id, titration_id)
);

-- Базовый пользователь-модератор: логин admin, пароль admin123 (только для
-- локальной разработки). Если admin уже есть, уже заданный пароль не меняется.
INSERT INTO users (id, username, password, role)
VALUES (1, 'admin', 'scrypt$0e846ce3c7f427f6730063c21473fffd$61c0604adbfa425b332390e667003c8e344fde971b5508ac8921b83bfcb8a95edc120ae91628cca11cefe622bb4372ed17b5b1a01085161f1bceab34864b1c6f', 'moderator')
ON CONFLICT (id) DO UPDATE
SET password = COALESCE(users.password, EXCLUDED.password),
    role = EXCLUDED.role;

-- Заполнение реальными данными опытов из лабораторной работы
INSERT INTO titrations (id, title, description, status, image_url, video_url, ph, concentration, creator_id, formed_at)
VALUES
  (
    1,
    'HCl + NaOH (Сильная к-та/Сильная щелочь)',
    'Точка эквивалентности находится точно при pH 7.0. Классический кристальный скачок.',
    'published',
    'http://localhost:9000/titration/image6.jpg',
    'http://localhost:9000/titration/video1.mp4',
    7.00,
    0.10,
    1,
    NOW()
  ),
  (
    2,
    'CH3COOH + NaOH (Слабая к-та/Сильная щелочь)',
    'Скачок титрования в щелочной среде (pH 8.7). Индикатор — фенолфталеин.',
    'published',
    'http://localhost:9000/titration/image2.jpg',
    'http://localhost:9000/titration/video2.mp4',
    8.7,
    0.05,
    1,
    NOW()
  ),
  (
    3,
    'HNO3 + KOH (Азотная кислота и гидроксид калия)',
    'Полная нейтрализация с выделением тепла. Нейтральная среда в точке эквивалентности.',
    'published',
    'http://localhost:9000/titration/image3.jpg',
    'http://localhost:9000/titration/video3.mp4',
    7,
    0.2,
    1,
    NOW()
  ),
  (
    4,
    'H2SO4 + NH3 (Серная кислота и аммиак)',
    'Титрование слабой щелочью. Точка эквивалентности смещена в кислую область (pH 5.2).',
    'published',
    'http://localhost:9000/titration/image4.jpg',
    'http://localhost:9000/titration/video4.mp4',
    7.00,
    0.05,
    1,
    NOW()
  ),
  (
    5,
    'HCOOH + NaOH (Муравьиная кислота и гидроксид натрия)',
    'Титрование одноосновной органической кислоты с розоватым переходом фенолфталеина.',
    'published',
    'http://localhost:9000/titration/image5.jpg',
    'http://localhost:9000/titration/video5.mp4',
    8.3,
    0.08,
    1,
    NOW()
  ),
  (
    6,
    'H2C2O4 + KMn04 (Перманганатометрия щавеливой кислоты)',
    'Редокс-титрование без постороннего индикатора. Разрушение розоватого перманганата.',
    'published',
    'http://localhost:9000/titration/image1.jpg',
    'http://localhost:9000/titration/video6.mp4',
    1.5,
    0.25,
    1,
    NOW()
  )
ON CONFLICT DO NOTHING;

-- Лайки для первичного наполнения
INSERT INTO likes (user_id, titration_id)
VALUES
  (1, 1),
  (1, 2),
  (1, 3),
  (1, 5)
ON CONFLICT DO NOTHING;

-- Записи выше вставлены с явными id, поэтому счётчики SERIAL нужно подтянуть
-- к максимуму: иначе первая же регистрация получит id = 1 и упадёт на дубле.
-- GREATEST не даёт сдвинуть счётчик назад при повторном запуске скрипта.
SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), (SELECT last_value FROM users_id_seq)));
SELECT setval('titrations_id_seq', GREATEST((SELECT MAX(id) FROM titrations), (SELECT last_value FROM titrations_id_seq)));
