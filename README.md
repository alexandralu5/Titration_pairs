# Titration Pairs

Веб-приложение, где хранятся пары веществ для титрования (например, HCl + NaOH).
У каждой пары есть название, описание, pH, концентрация, картинка и видео.
Картинки и видео лежат в MinIO, остальные данные — в PostgreSQL.

Приложение сделано на NestJS. Работает в двух режимах:

- **SSR** — страницы на Handlebars (`/grid`, `/add`, `/feed`, `/login`, `/register`, `/profile`), SQL пишется напрямую через `pg`;
- **REST API** — методы под `/api/titration_pairs/*`, работа с БД через TypeORM.

Авторизация сессионная: при входе сервер создаёт сессию в **Redis** и отдаёт её
идентификатор в куке `sessionId`. Без авторизации доступно только чтение, методы
создателя требуют сессию. Все методы API описаны в **Swagger**.

## Запуск

```bash
npm install
docker compose up -d                      # PostgreSQL и Redis
npx ts-node scripts/migrate.ts            # создать/обновить таблицы и залить тестовые данные
npm run start:dev                          # http://localhost:3000
```

MinIO запускается отдельным контейнером на порту `9000`, в `docker-compose.yml` его нет.

| Адрес | Что там |
|-------|---------|
| `http://localhost:3000/api` | Swagger UI — все методы API |
| `http://localhost:3000/api-json` | та же схема в формате OpenAPI JSON |
| `http://localhost:3000/login` | страница входа |
| `http://localhost:3000/grid` | плитка опытов |

Тестовый пользователь из `scripts/seed.sql`: логин `admin`, пароль `admin123`, роль `moderator`.
Он нужен только для локальной разработки.

Файл `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=password
DB_DATABASE=titration_db
DB_SYNCHRONIZE=false
DB_LOGGING=false
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=root
MINIO_SECRET_KEY=rootpassword
MINIO_BUCKET=titration
REDIS_HOST=localhost
REDIS_PORT=6379
SESSION_TTL=3600
```

`SESSION_TTL` — время жизни сессии и куки в секундах. Необязательная `CORS_ORIGIN` —
адреса фронтенда через запятую, которым разрешены запросы с кукой (по умолчанию
`http://localhost:5173`).

Таблицы создаёт файл `scripts/seed.sql`. Поэтому `DB_SYNCHRONIZE=false` — ORM схему не трогает.
Скрипт можно запускать повторно: на базе, созданной до этой лабораторной, он добавит
колонки `users.password`, `users.role` и `titrations.moderator_id`.

---

## Все HTTP-методы

Всего 21 маршрут: 9 SSR и 12 REST.

### Правила URL (требования методички)

- ресурс назван **существительным во множественном числе**: услуги лежат прямо под `/api/titration_pairs`, пользователи — под `/api/titration_pairs/users`;
- **действие задаёт HTTP-метод**: `GET` — прочитать, `POST` — создать, `PUT` — изменить, `DELETE` — удалить;
- **идентификатор объекта — в пути** (`:id`);
- **фильтры и условия выборки — в строке запроса** (`?minConcentration=`, `?next=`).

Поэтому в URL нет `register` и `publish`: регистрация — это `POST /users`,
публикация — `PUT /:id`. Замена картинки идемпотентна, поэтому это `PUT`, а не `POST`.
Вход и выход по заданию оба делаются методом `POST`, поэтому различаются адресом:
`POST /users/login` и `POST /users/logout`.

Колонка «Доступ»: **гость** — метод работает без авторизации, **сессия** — нужна кука
`sessionId` действующей сессии, иначе API отвечает `401`, а SSR-страница отправляет на `/login`.

| Метод | URL | Доступ | Что делает |
|-------|-----|--------|------------|
| `GET` | `/grid` | гость | Сетка опытов. Фильтр `?concentration=` |
| `GET` | `/add` | сессия | Форма добавления |
| `POST` | `/add` или `/add/step1` | сессия | Создать черновик по названию → редирект на `/add` |
| `POST` | `/add/publish` | сессия | Опубликовать черновик → редирект на `/grid` |
| `POST` | `/delete` | сессия | Удалить опыт (логически) → редирект на `/grid` |
| `GET` | `/feed` или `/feed/:id` | гость | Лента опубликованных опытов |
| `GET` | `/login` | гость | Страница входа |
| `GET` | `/register` | гость | Страница регистрации |
| `GET` | `/profile` | сессия | Профиль: логин, роль, кнопка «Выход» |
| `GET` | `/api/titration_pairs` | гость | Список опубликованных. Фильтр `?minConcentration=`. Признак `is_mine` (1/0) |
| `GET` | `/api/titration_pairs/feed` | гость | Лента: одна запись — первая опубликованная. Признак `is_liked` (1/0) |
| `GET` | `/api/titration_pairs/feed/:id` | гость | Одна запись ленты, `?next=true` — следующая |
| `GET` | `/api/titration_pairs/draft` | сессия | Черновик текущего пользователя |
| `POST` | `/api/titration_pairs` | сессия | Создать черновик (multipart: `title`, `image`, `video`) |
| `PUT` | `/api/titration_pairs/:id/image` | сессия | Заменить картинку (multipart: `image`) |
| `PUT` | `/api/titration_pairs/:id` | сессия | Обновить услугу: публикация `draft` → `published` |
| `DELETE` | `/api/titration_pairs/:id` | сессия | Логическое удаление |
| `POST` | `/api/titration_pairs/:id/like` | сессия | Лайк `{"value":1}` или снятие `{"value":0}` |
| `POST` | `/api/titration_pairs/users` | гость | Регистрация |
| `POST` | `/api/titration_pairs/users/login` | гость | Аутентификация: создаёт сессию, ставит куку `sessionId` |
| `POST` | `/api/titration_pairs/users/logout` | сессия | Деавторизация: удаляет сессию |


### Формат ответа

Объект услуги всегда содержит **одинаковый базовый набор полей** — пустое значение
отдаётся как `null` (или `''` для строк), но ключ присутствует всегда:

```json
{
  "id": 1,
  "title": "Опыт №1",
  "description": null,
  "ph": 7,
  "concentration": null,
  "image_url": "http://localhost:9000/titration/photo.jpg",
  "video_url": "",
  "likes_count": 0,
  "created_at": "2026-09-30T10:00:00.000Z",
  "formed_at": null
}
```

Два метода добавляют к базовому набору по одному признаку. Оба считаются относительно пользователя сессии и отдаются числом `1` или `0`, а не `true`/`false`. Для гостя оба признака равны `0`:

| Признак | Где отдаётся | Значение |
|---------|--------------|----------|
| `is_liked` | только лента: `GET /feed` и `GET /feed/:id` | `1`, если текущий пользователь поставил лайк этой услуге |
| `is_mine` | только список (плитка): `GET /api/titration_pairs` | `1`, если текущий пользователь — создатель услуги |

В остальных ответах (черновик, создание, замена картинки, публикация) этих признаков нет.

`status` в ответе **не участвует**: статус хранится только в БД и используется для
фильтрации ленты и логического удаления.

Тело любой ошибки пустое — `{}`. Ни `statusCode`, ни `error`, ни `message` в JSON
не отдаются, ошибка определяется только по HTTP-коду ответа:

| HTTP-код | Когда |
|----------|-------|
| `200` | Успешный GET, замена картинки (PUT), обновление услуги (PUT), DELETE, вход и выход (POST) |
| `201` | Создание услуги (POST), лайк (POST), регистрация (POST) |
| `400` | Невалидные данные или лишние поля в запросе |
| `401` | Нет сессии: кука не передана, сессия истекла или пользователь вышел; неверный логин или пароль при входе |
| `403` | Сессия есть, но действие разрешено только автору / модератору |
| `404` | Записи нет, черновика нет, лента пуста, следующей записи в ленте нет |
| `409` | Логин уже занят |

### REST API

**`GET /api/titration_pairs`** — отдаёт массив только опубликованных записей, сортировка по `id`.
Query-параметр `minConcentration` (число ≥ 0) — если задан, отбирает записи с `concentration >=` этого числа.
У каждой записи есть `is_mine` — `1`, если создатель совпадает с пользователем сессии, иначе `0`. Метод открыт гостю, для него `is_mine` всегда `0`.

```bash
curl "http://localhost:3000/api/titration_pairs?minConcentration=0.1"
```

**`GET /api/titration_pairs/feed`** — лента без ид: возвращает **одну** запись (объект, а не массив) — первую опубликованную по `id`. В записи есть `is_liked` — лайкнул ли её пользователь сессии (у гостя `0`). Если опубликованных записей нет — `404`.

**`GET /api/titration_pairs/feed/:id`** — одна запись ленты по ид. `:id` — число. Если добавить `?next=true`, вернётся следующая за ней опубликованная запись. Если следующей записи нет — `404`.

**`GET /api/titration_pairs/draft`** — черновик пользователя сессии, `id` не указывается. Без сессии — `401`, если черновика нет — `404`.

**`POST /api/titration_pairs`** — создаёт черновик. Тело — `multipart/form-data`:

| Поле | Обязательно | Ограничения |
|------|-------------|-------------|
| `title` | да | непустая строка |
| `image` | нет | jpg, jpeg, png, gif, webp; до 10 МБ |
| `video` | нет | mp4, webm, mov; до 10 МБ |

Ответ `201`. В БД сразу ставится `status = 'draft'`, а в `image_url` / `video_url` кладётся только имя файла из MinIO.
Создатель (`creator_id`) **заполняется автоматически** пользователем из сессии — передать его в запросе нельзя.

```bash
curl -X POST http://localhost:3000/api/titration_pairs -b "sessionId=<значение куки>" -F "title=Опыт №1" -F "image=@photo.jpg"
```

**`PUT /api/titration_pairs/:id/image`** — заменяет картинку. Операция идемпотентная, поэтому метод `PUT`, а не `POST`: повторный вызов заменяет ресурс, а не создаёт новый. Старый файл при этом удаляется из MinIO. Менять может только автор опыта или модератор, иначе `403`.

**`PUT /api/titration_pairs/:id`** — обновляет услугу; в нашем домене обновление черновика одновременно его публикует. Тело — JSON:

| Поле | Обязательно | Ограничения |
|------|-------------|-------------|
| `description` | нет | строка |
| `ph` | нет | число от 0 до 14 |
| `concentration` | нет | число ≥ 0 |

Сервер сам ставит `status = 'published'` и `formed_at = NOW()`, а если публикует модератор — ещё и `moderator_id`. Эти поля из запроса принять нельзя — вернуться из `published` в `draft` нельзя, попытка даёт `400`. Гость получает `401`, чужой пользователь без роли модератора — `403`.

**`DELETE /api/titration_pairs/:id`** — запись физически остаётся в БД, но получает `status = 'deleted'` и пропадает из всех списков. Удалить может автор или модератор. Ответ: `{"id": 1}`.

**`POST /api/titration_pairs/:id/like`** — тело `{"value": 1}` поставить лайк, `{"value": 0}` снять. Значение может быть только 0 или 1, иначе `400`. Лайк ставится от имени пользователя сессии. Повторный лайк не создаёт дубль — за это отвечает уникальный индекс в БД. Ответ: `{"liked": true, "likes_count": 4}`.

**`POST /api/titration_pairs/users`** — регистрация, тело `{"username": "ivanov", "password": "secret123"}`.

| Поле | Обязательно | Ограничения |
|------|-------------|-------------|
| `username` | да | непустая строка до 50 символов, уникальная |
| `password` | да | строка от 6 до 72 символов |

Новый пользователь всегда получает роль `user` — передать `role` в запросе нельзя (`400`).
Пароль сохраняется в виде хеша. Занятый логин — `409`. Ответ `201`:

```json
{ "id": 2, "username": "ivanov", "role": "user", "created_at": "2026-10-11T13:30:55.482Z" }
```

**`POST /api/titration_pairs/users/login`** — аутентификация, тело `{"username": "admin", "password": "admin123"}`.
Если логин и пароль верны, сервер создаёт сессию в Redis и ставит куку. Ответ `200` — тот же объект пользователя, а в заголовках:

```http
Set-Cookie: sessionId=2d5bb1ad-90a7-4303-ae29-c06e07b6a1e4; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax
```

Неверный логин и неверный пароль дают одинаковый ответ `401` — по ответу нельзя узнать, существует ли такой логин.

**`POST /api/titration_pairs/users/logout`** — деавторизация: сессия удаляется из Redis, кука очищается. Ответ `200` и `{"id": 2}` — кто вышел. После выхода старая кука даёт `401`. Без сессии метод тоже отвечает `401`.

### SSR-маршруты

Отдают HTML, а не JSON. Используют ту же сессию, что и API: страницы `/add`, `/delete` и `/profile` без куки `sessionId` перенаправляют на `/login`.

**`GET /grid`** — берёт из БД опубликованные записи и считает лайки:

```sql
SELECT t.*, COUNT(l.id) AS likes_count
FROM titrations t
LEFT JOIN likes l ON t.id = l.titration_id
WHERE t.status = 'published'
GROUP BY t.id ORDER BY t.id ASC;
```

**`GET /add`** — одна страница, но на ней два шага. Показывает черновик пользователя сессии. Если черновика ещё нет — показывается поле для названия, а фото и видео выводятся заглушками (`default-image.jpg`, `default-video.mp4`), заменить их на этом шаге нельзя. Если черновик есть — те же фото и видео уже можно заменить своими файлами (клик по превью), плюс поля pH и концентрации и кнопка «Опубликовать».

**`POST /add/step1`** — принимает `title` и создаёт черновик со значениями по умолчанию (`ph = 7.0`, `concentration = 0.10`), создателем записывается пользователь сессии. Пустое название заменяется на «Новый опыт».

**`POST /add/publish`** — если в теле есть `id`, обновляет черновик, иначе вставляет новую запись. Принимает `id`, `title`, `description`, `ph`, `concentration`, `image_url`, `video_url` и файлы `image`, `video`. Файлы грузятся в MinIO под именем `<время>-<исходное имя>`.

**`POST /delete`** — принимает `id` и делает `UPDATE titrations SET status = 'deleted'`, если опыт создал пользователь сессии или он модератор.

**`GET /feed/:id`** — если `:id` не найден среди опубликованных, бросается `404`.

**`GET /login`**, **`GET /register`** — формы входа и регистрации. Они отправляют JSON в API (`POST /users/login`, `POST /users`) и показывают ошибку по коду ответа. Если сессия уже есть, `/login` сразу открывает профиль.

**`GET /profile`** — логин и роль пользователя сессии и кнопка «Выход», которая вызывает `POST /users/logout`.

### Что может вернуться вместо успеха

| Код | Когда |
|-----|-------|
| `400` | Не прошла валидация, лишние поля в запросе, нельзя опубликовать не-черновик |
| `401` | Нет действующей сессии; неверный логин или пароль |
| `403` | Действует не автор опыта и не модератор |
| `404` | Опыта нет или он удалён, черновика нет, в ленте нет следующей записи |
| `409` | Такой `username` уже есть |

---

## Таблицы БД

Три таблицы: `users`, `titrations`, `likes`.

### `users`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | `SERIAL` | первичный ключ |
| `username` | `VARCHAR(50)` | `NOT NULL`, `UNIQUE` |
| `password` | `VARCHAR(255)` | хеш пароля; `NULL` у пользователей, созданных до этой лабораторной, — войти они не могут |
| `role` | `VARCHAR(20)` | `NOT NULL`, по умолчанию `'user'`; `user` или `moderator` |
| `created_at` | `TIMESTAMP` | по умолчанию `CURRENT_TIMESTAMP` |

### `titrations`

| Поле | Тип | Ограничения | Зачем |
|------|-----|-------------|-------|
| `id` | `SERIAL` | первичный ключ | номер опыта |
| `title` | `VARCHAR(100)` | `NOT NULL` | название пары веществ |
| `description` | `VARCHAR(255)` | может быть `NULL` | описание опыта |
| `status` | `VARCHAR(20)` | `NOT NULL`, по умолчанию `'draft'` | `draft` / `published` / `deleted` |
| `image_url` | `VARCHAR(255)` | может быть `NULL` | имя файла картинки в MinIO |
| `video_url` | `VARCHAR(255)` | может быть `NULL` | имя файла видео в MinIO |
| `ph` | `REAL` | может быть `NULL` | кислотность |
| `concentration` | `REAL` | может быть `NULL` | концентрация |
| `created_at` | `TIMESTAMP` | по умолчанию `CURRENT_TIMESTAMP` | когда создана запись |
| `formed_at` | `TIMESTAMP` | может быть `NULL` | когда опубликован опыт |
| `creator_id` | `INT` | `NOT NULL`, внешний ключ на `users(id)` | кто создал — пользователь сессии |
| `moderator_id` | `INT` | может быть `NULL` | модератор, опубликовавший опыт |

### `likes`

| Поле | Тип | Ограничения |
|------|-----|-------------|
| `id` | `SERIAL` | первичный ключ |
| `user_id` | `INT` | `NOT NULL`, внешний ключ на `users(id)` |
| `titration_id` | `INT` | `NOT NULL`, внешний ключ на `titrations(id)` |

Плюс ограничение `UNIQUE (user_id, titration_id)` — один пользователь не может поставить два лайка одному опыту.

Все три внешних ключа сделаны с `ON DELETE RESTRICT`, каскадного удаления нет.

### Связи

```
users (1) ────< (N) titrations      titrations.creator_id
   │                                         │
   └──────< (N) likes >────────────── (1) ────┘
            likes.user_id              likes.titration_id
```

### Тестовые данные

`scripts/seed.sql` создаёт пользователя `admin` (id 1, роль `moderator`, пароль `admin123`), 6 опубликованных опытов и 4 лайка.
В конце скрипт подтягивает счётчики `users_id_seq` и `titrations_id_seq` к максимальному `id`:
записи вставлены с явными номерами, и без этого первая регистрация получила бы `id = 1` и упала на дубле.

### Где что хранится

| Хранилище | Что лежит |
|-----------|-----------|
| PostgreSQL | пользователи (с хешем пароля и ролью), опыты, лайки |
| Redis | активные сессии: ключ `session:<sessionId>`, значение — пользователь, TTL 1 час |
| MinIO | картинки и видео |
| Кука браузера | только `sessionId` — случайный идентификатор, по которому ничего нельзя узнать о пользователе |

---

## DTO

Входные данные проверяются глобальным `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`). Если в запросе есть поле, которого нет в DTO, приходит `400`.

| DTO | Поле | Правила |
|-----|------|---------|
| `CreateServiceDto` | `title` | строка, непустая |
| `UpdateServiceDto` | `description` | строка |
| | `ph` | число 0…14 |
| | `concentration` | число ≥ 0 |
| `LikeDto` | `value` | только 0 или 1 |
| `RegisterDto` | `username` | строка, непустая, до 50 символов |
| | `password` | строка от 6 до 72 символов |
| `LoginDto` | `username` | строка, непустая |
| | `password` | строка, непустая |
| `ServiceFiltersDto` | `minConcentration` | число ≥ 0 |

Системные поля (`id`, `status`, `creator_id`, `moderator_id`, `role`, даты) от клиента не принимаются.

DTO домена «Услуга» лежат в `src/api/dto/`, домена «Пользователь» — в `src/auth/dto/`. У каждого поля есть `@ApiProperty` с примером — из них Swagger строит схему запроса.

---

## Модели

Модели — это классы TypeORM из `src/titration/entities/`. Каждый класс соответствует одной таблице в PostgreSQL: первичный ключ помечен `@PrimaryGeneratedColumn()`, связи — `@ManyToOne` вместе с `@JoinColumn`, а колонка `created_at` заполняется сама базой через `@CreateDateColumn()`.

| Модель | Таблица | Файл |
|--------|---------|------|
| `User` | `users` | `src/titration/entities/user.entity.ts` |
| `Titration` | `titrations` | `src/titration/entities/titration.entity.ts` |
| `Like` | `likes` | `src/titration/entities/like.entity.ts` |

**`User`** — `id`, `username` (`VARCHAR(50)`, уникальный), `password`, `role` и `created_at`. В `password` лежит не пароль, а его хеш; колонка объявлена с `select: false`, поэтому в обычные выборки не попадает и читается явно только при входе. `role` — `user` (по умолчанию) или `moderator`.

**`Titration`** — главная модель опыта:

| Свойство | Что означает |
|----------|--------------|
| `id` | номер опыта |
| `title` | название пары веществ |
| `description` | описание, может быть пустым |
| `status` | `draft` → `published` → `deleted`, по умолчанию `draft` |
| `image_url`, `video_url` | **не** ссылки, а имена файлов в MinIO |
| `ph`, `concentration` | кислотность и концентрация |
| `created_at` | когда создана запись |
| `formed_at` | когда опыт опубликован |
| `moderator_id` | модератор, опубликовавший опыт; `NULL`, если публиковал автор |
| `creator` | связь с `User` по колонке `creator_id` |

Поля `moderator_id` и `creator` помечены `@Exclude()`. В `main.ts` (строка 40) глобально подключён `ClassSerializerInterceptor`, поэтому при прямой отдаче сущности в JSON системные поля наружу не уходят.

**`Like`** — таблица-связь: `user` ссылается на `users.id`, `titration` — на `titrations.id`. На уровне класса стоит `@Unique(['user', 'titration'])`, поэтому один пользователь не может поставить два лайка одному опыту.

Все три внешних ключа объявлены с `onDelete: 'RESTRICT'` — каскадного удаления нет, нельзя удалить пользователя или опыт, пока на них кто-то ссылается.

---

## Сериализаторы

Модель нельзя отдавать клиенту как есть: в ней лежат системные поля, которые не должны редактироваться, а в `image_url` и `video_url` хранится не ссылка, а имя файла. Поэтому в `src/api/serializers.ts` лежат отдельные функции.

| Функция | Строки | Что делает |
|---------|--------|------------|
| `fileUrl(value)` | 36–40 | из имени файла собирает публичный адрес `http://localhost:9000/titration/<файл>`; если пришёл уже готовый URL — не трогает его |
| `serializeService(row, likesCount)` | 87–100 | модель `Titration` → базовый объект `ServiceDto` |
| `serializeFeedService(row, likesCount, isLiked)` | 102–104 | запись ленты: базовые поля + `is_liked` (`FeedServiceDto`) |
| `serializeListService(row, likesCount, isMine)` | 106–108 | карточка списка: базовые поля + `is_mine` (`ListServiceDto`) |
| `serializeUser(row)` | 140–147 | модель `User` → объект `UserDto`: `id`, `username`, `role`, `created_at` — без пароля |

Формы ответов (`ServiceDto`, `FeedServiceDto`, `ListServiceDto`, `UserDto`, `LikeResultDto`, `IdDto`) объявлены классами с `@ApiProperty` — по ним Swagger показывает схему ответа каждого метода.

Что именно делает `serializeService`:

- оставляет только разрешённые поля — `moderator_id` и `creator_id` в ответе нет;
- превращает `image_url` и `video_url` в готовые ссылки через `fileUrl`;
- добавляет `likes_count` — количество лайков, которого в таблице `titrations` вообще нет, оно приходит вторым аргументом;
- приводит `id`, `ph` и `concentration` к типу `Number`, а пустые значения — к `null`.

Возвращается обычный объект формы `ServiceDto` — так TypeScript проверяет, что реальная форма ответа совпадает с описанием. `serializeFeedService` и `serializeListService` вызывают `serializeService` и дописывают к результату один признак, переводя `true`/`false` в `1`/`0`. Поэтому базовый набор полей везде одинаковый, а `is_liked` есть только в ленте, `is_mine` — только в списке.

Где они вызываются в `api.service.ts`:

| Строка | Метод | Сериализатор |
|--------|-------|--------------|
| 78 | `listServices()` — список | `serializeListService`, признак `is_mine`: `!!user && t.creator?.id === user.id` |
| 303 | `toDto()` — черновик, создание, замена картинки, публикация | `serializeService` |
| 318 | `toFeedDto()` — `feed()` и `feedItem()` | `serializeFeedService`, признак `is_liked`: есть ли лайк пользователя сессии |

У SSR-слоя своя вёрстка данных: в `app.service.ts` есть отдельные приватные `getFileUrl()` (строка 64) и `formatPair()` (строка 70), которые кладут в шаблон то, что ожидают `grid.hbs`, `add.hbs` и `feed.hbs`. Общего сериализатора у двух слоёв нет намеренно — у них разные формы ответа.

---

## Авторизация: сессии, куки и Redis

**Аутентификация** — подтверждение личности («кто ты?»): пользователь присылает логин и пароль, сервер сверяет их с БД.
**Авторизация** — проверка прав («что тебе можно?»): гость только читает, пользователь управляет своими услугами, модератор — любыми.

Аутентификация сессионная (stateful): сервер сам хранит, кто вошёл, а клиенту отдаёт только случайный идентификатор.

1. `POST /api/titration_pairs/users/login` — сервер находит пользователя и сверяет пароль с хешем из БД.
2. Если всё верно, создаёт запись в Redis: `session:<sessionId>` → `{"id":1,"username":"admin","role":"moderator"}` со временем жизни 1 час.
3. Отдаёт идентификатор в куке: `Set-Cookie: sessionId=<sessionId>; HttpOnly; SameSite=Lax`.
4. Браузер сам прикладывает эту куку к каждому следующему запросу.
5. Guard читает `sessionId` из куки и ищет сессию в Redis: нашлась — пользователь известен, нет — `401`.
6. `POST /users/logout` удаляет запись из Redis — кука перестаёт действовать сразу, даже если её скопировали.

Флаг `HttpOnly` прячет куку от JavaScript (её нельзя украсть через XSS), `SameSite=Lax` не даёт чужому сайту отправить запрос от имени пользователя (CSRF). `sessionId` — случайный UUID, в нём нет ни логина, ни роли.

Redis нужен, потому что сессии нельзя держать в памяти процесса: они пропадут при перезапуске сервера и не будут видны второму экземпляру приложения. Redis хранит их отдельно, быстро отдаёт по ключу и сам удаляет просроченные по TTL.

### Из чего состоит

| Файл | Что делает |
|------|------------|
| `src/session/session.service.ts` | работа с Redis: `create()` — `SETEX`, `getUser()` — `GET`, `destroy()` — `DEL` |
| `src/session/session.module.ts` | глобальный модуль с `SessionService` |
| `src/auth/auth.service.ts` | `register()` (строка 31), `login()` (56), `logout()` (79), `getSessionUser()` (86) |
| `src/auth/users.controller.ts` | маршруты `/users`, `/users/login`, `/users/logout`; ставит и очищает куку |
| `src/auth/guards/session.guard.ts` | `SessionGuard` (строка 11) и `OptionalSessionGuard` (строка 31) |
| `src/auth/auth-user.ts` | тип `AuthUser` (`id`, `username`, `role`), имя куки и декоратор `@CurrentUser()` |
| `src/auth/password.ts` | `hashPassword()` и `verifyPassword()` |
| `src/main.ts` | `cookieParser()` (строка 21) — разбирает заголовок `Cookie` в `req.cookies` |

Два guard'а:

- **`SessionGuard`** стоит на методах создателя. Нет куки или сессии — `401`; есть — кладёт пользователя в `req.user`.
- **`OptionalSessionGuard`** стоит на публичных методах чтения (список и лента). Гостя пропускает с `req.user = null`, а если сессия есть — подставляет пользователя, чтобы посчитать `is_mine` и `is_liked`.

Контроллер получает пользователя декоратором `@CurrentUser()` и передаёт его в сервис параметром:

```ts
@Post()
@UseGuards(SessionGuard)
create(@Body() dto: CreateServiceDto, @CurrentUser() user: AuthUser, ...) {
  return this.apiService.createDraft(dto, user, ...);
}
```

### Автозаполнение пользователя

Раньше создатель был зафиксирован константой (`currentUser()` всегда возвращал `admin`). Теперь во все методы `ApiService` (`src/api/api.service.ts`) приходит пользователь сессии:

| Строка | Метод | Как используется |
|--------|-------|------------------|
| 63 | `listServices()` | признак `is_mine` в списке; у гостя `0` |
| 128 | `getDraft()` | ищет черновик: `where: { status: 'draft', creator: { id: user.id } }` |
| 147 | `createDraft()` | **автозаполнение создателя**: `creator: { id: user.id }` (строка 164) |
| 175 | `uploadImage()` | `canManage()` — иначе `403` |
| 212 | `updateService()` | `canManage()` — иначе `403`; `moderator_id`, если публикует модератор |
| 249 | `deleteService()` | `canManage()` — иначе `403` |
| 266 | `setLike()` | лайк ставится от имени пользователя: `user: { id: user.id }` |
| 312 | `toFeedDto()` | признак `is_liked` в ленте; у гостя `0` |

Клиент не может выдать себя за другого: `creator_id` в запросе не принимается (лишнее поле — `400`), он берётся только из сессии.

### Роли

| Роль | Что может |
|------|-----------|
| гость (без сессии) | читать список и ленту, зарегистрироваться, войти |
| `user` | всё, что гость, плюс создавать услуги, видеть свой черновик, публиковать, менять картинку и удалять **свои** услуги, ставить лайки |
| `moderator` | всё, что `user`, плюс публиковать, менять и удалять **любые** услуги |

Проверка одна — `canManage()` (строка 307): `item.creator?.id === user.id || user.role === 'moderator'`.
При регистрации роль всегда `user`; модератор `admin` создаётся в `scripts/seed.sql`.

### Пароли

В БД хранится не пароль, а строка `scrypt$<соль>$<хеш>`. Соль у каждого пользователя своя, поэтому одинаковые пароли дают разные хеши, и по утёкшей таблице пароль не восстановить. `scrypt` входит в стандартную библиотеку Node.js, отдельный пакет не нужен. Хеш никогда не попадает в ответ: колонка объявлена с `select: false`, а `serializeUser()` её не отдаёт.

## Swagger

Документация всех методов API: `http://localhost:3000/api`. Подключается в `src/main.ts` (строка 67).

- Методы сгруппированы по доменам: «Услуги» и «Пользователи».
- У каждого метода есть описание, схема тела запроса и ответа, список возможных кодов.
- Методы, которым нужна сессия, помечены замком (`@ApiCookieAuth()`). **Без авторизации в Swagger работают только методы чтения** (список и лента), регистрация и вход; методы создателя отвечают `401`.
- SSR-страницы в Swagger не показаны (`@ApiExcludeController()`).

Чтобы авторизоваться, достаточно выполнить в Swagger `POST /api/titration_pairs/users/login`: сервер поставит куку, и браузер сам будет прикладывать её к следующим запросам. Вводить что-то в окне **Authorize** не нужно: кука `HttpOnly`, вручную из страницы её не подставить.

## Порядок показа

1. **Swagger в режиме инкогнито.** Открыть `http://localhost:3000/api`, выполнить `POST /users/login` с `{"username":"admin","password":"admin123"}` — ответ `200`. Затем `GET /api/titration_pairs` — список услуг.
2. **Кука из браузера.** DevTools → Application → Cookies → `http://localhost:3000` → скопировать значение `sessionId`.
3. **Postman / Insomnia.** В запросах добавить заголовок `Cookie: sessionId=<значение>`.
4. **Список без авторизации.** `GET /api/titration_pairs` отвечает `200` и с кукой, и без неё. Разница только в `is_mine`.
5. **Публикация.** `PUT /api/titration_pairs/:id` без куки — `401`; с кукой чужого пользователя — `403`; с кукой создателя — `200`, в ответе обновлённые поля и заполненный `formed_at`.
6. **Redis.** Список сессий и пользователь сессии:

```bash
docker exec -it redis redis-cli
> KEYS session:*
1) "session:2d5bb1ad-90a7-4303-ae29-c06e07b6a1e4"
> GET session:2d5bb1ad-90a7-4303-ae29-c06e07b6a1e4
"{\"id\":1,\"username\":\"admin\",\"role\":\"moderator\"}"
> TTL session:2d5bb1ad-90a7-4303-ae29-c06e07b6a1e4
(integer) 3542
```

После `POST /users/logout` ключ исчезает из `KEYS session:*`, а запрос со старой кукой получает `401`.

## Диаграмма последовательности

Файл `titration_pairs-sequence.drawio` открывается в [draw.io](https://app.diagrams.net/). На диаграмме — все HTTP-запросы бизнес-процесса, без БД. Линии жизни — фронтенд и два домена, сообщения — методы доменов, в скобках ключевые входные и выходные данные.

| № | Запрос | Ответ |
|---|--------|-------|
| 1–2 | `POST /users/login(username, password)` | кука `sessionId`, JSON пользователя |
| 3–4 | `GET /titration_pairs(minConcentration)` | JSON списка услуг |
| 5–6 | `POST /titration_pairs(title, image, video)` | JSON черновика |
| 7–8 | `GET /titration_pairs/draft()` | JSON полей черновика |
| 9–10 | `PUT /titration_pairs/id(description, ph, concentration)` | JSON опубликованной услуги |
| 11–12 | `GET /titration_pairs/feed()` | JSON первой записи ленты |
| 13–14 | `GET /titration_pairs/feed/id(next=true)` | JSON следующей записи ленты |
| 15–16 | `POST /titration_pairs/id/like(value=1)` | JSON результата лайка |

## Файлы в MinIO

Бакет `titration`, доступ по адресу `http://localhost:9000/titration/<имя файла>`. Ограничение — 10 МБ, принимаются jpg, jpeg, png, gif, webp (картинки) и mp4, webm, mov (видео). В базе лежит только имя файла, полный URL собирается на лету. Если у опыта нет медиа, подставляются заглушки `public/img/default-image.jpg` и `public/img/default-video.mp4`.

## Структура проекта

```text
src/
├── main.ts                 запуск: hbs, статика, куки, валидация, CORS, Swagger
├── app.module.ts           ConfigModule + TypeOrmModule + SessionModule + AuthModule + ApiModule
├── app.controller.ts       SSR-маршруты
├── app.service.ts          SSR-логика, прямой SQL
├── api/
│   ├── api.controllers.ts  ServicesController — домен «Услуга»
│   ├── api.service.ts      бизнес-логика REST
│   ├── serializers.ts      превращение сущностей в JSON, формы ответов для Swagger
│   ├── minio.provider.ts   подключение к MinIO
│   └── dto/                DTO услуг для валидации
├── auth/
│   ├── users.controller.ts UsersController — домен «Пользователь»
│   ├── auth.service.ts     регистрация, вход, выход
│   ├── auth-user.ts        тип AuthUser и декоратор @CurrentUser()
│   ├── password.ts         хеширование паролей
│   ├── guards/             SessionGuard, OptionalSessionGuard
│   └── dto/                RegisterDto, LoginDto
├── session/                SessionService — сессии в Redis
└── titration/entities/     Titration, User, Like
views/                      grid, add, feed, login, register, profile (.hbs)
public/                     стили и картинки-заглушки
scripts/                    migrate.ts и seed.sql
test/                       тесты контракта ответа и авторизации
titration_pairs-er.drawio        ER-диаграмма базы данных
titration_pairs-classes.drawio   диаграмма классов
titration_pairs-sequence.drawio  диаграмма последовательности
postman_collection.json     готовые запросы для Postman
```

## Ссылки

- [NestJS](https://docs.nestjs.com/) — [валидация](https://docs.nestjs.com/techniques/validation), [БД](https://docs.nestjs.com/techniques/database)
- [TypeORM](https://typeorm.io/) — [сущности](https://typeorm.io/entities)
- [PostgreSQL](https://www.postgresql.org/docs/current/sql.html)
- [MinIO](https://min.io/docs/minio/linux/index.html)
- [Redis](https://redis.io/docs/latest/) — [команды](https://redis.io/docs/latest/commands/)
- [NestJS: OpenAPI (Swagger)](https://docs.nestjs.com/openapi/introduction), [guards](https://docs.nestjs.com/guards)
- [OWASP: Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
