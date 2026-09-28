# Titration Pairs

Веб-приложение, где хранятся пары веществ для титрования (например, HCl + NaOH).
У каждой пары есть название, описание, pH, концентрация, картинка и видео.
Картинки и видео лежат в MinIO, остальные данные — в PostgreSQL.

Приложение сделано на NestJS. Работает в двух режимах:

- **SSR** — страницы на Handlebars (`/grid`, `/add`, `/feed`), SQL пишется напрямую через `pg`;
- **REST API** — методы под `/api/*`, работа с БД через TypeORM.

## Запуск

```bash
npm install
docker compose up -d                      # PostgreSQL и MinIO
npx ts-node scripts/migrate.ts            # создать таблицы и залить тестовые данные
npm run start:dev                          # http://localhost:3000
```

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
```

Таблицы создаёт файл `scripts/seed.sql`. Поэтому `DB_SYNCHRONIZE=false` — ORM схему не трогает.

---

## Все HTTP-методы

Всего 18 маршрутов: 6 SSR и 12 REST.

| Метод | URL | Что делает |
|-------|-----|------------|
| `GET` | `/grid` | Сетка опытов. Фильтр `?concentration=` |
| `GET` | `/add` | Форма добавления |
| `POST` | `/add` или `/add/step1` | Создать черновик по названию → редирект на `/add` |
| `POST` | `/add/publish` | Опубликовать черновик → редирект на `/grid` |
| `POST` | `/delete` | Удалить опыт (логически) → редирект на `/grid` |
| `GET` | `/feed` или `/feed/:id` | Лента опубликованных опытов |
| `GET` | `/api/services` | Список опубликованных. Фильтр `?minConcentration=` |
| `GET` | `/api/services/feed` | Лента опубликованных |
| `GET` | `/api/services/feed/:id` | Одна запись ленты, `?next=true` — следующая |
| `GET` | `/api/services/draft` | Черновик текущего пользователя |
| `POST` | `/api/services` | Создать черновик (multipart: `title`, `image`, `video`) |
| `POST` | `/api/services/:id/image` | Заменить картинку (multipart: `image`) |
| `PUT` | `/api/services/:id/publish` | Публикация: `draft` → `published` |
| `DELETE` | `/api/services/:id` | Логическое удаление |
| `POST` | `/api/services/:id/like` | Лайк `{"value":1}` или снятие `{"value":0}` |
| `POST` | `/api/users/register` | Регистрация |
| `POST` | `/api/users/login` | Вход — пока заглушка |
| `POST` | `/api/users/logout` | Выход — пока заглушка |

### REST API

**`GET /api/services`** — отдаёт только опубликованные записи, сортировка по `id`.
Query-параметр `minConcentration` (число ≥ 0) — если задан, отбирает записи с `concentration >=` этого числа.

```bash
curl "http://localhost:3000/api/services?minConcentration=0.1"
```

**`GET /api/services/feed`** — то же самое, но без фильтра.

**`GET /api/services/feed/:id`** — одна запись ленты. `:id` — число. Если добавить `?next=true`, вернётся следующая запись. Если следующей записи нет — `404`.

**`GET /api/services/draft`** — черновик того, кто сейчас «залогинен» (см. `currentUser()`). Если черновика нет — `404`.

**`POST /api/services`** — создаёт черновик. Тело — `multipart/form-data`:

| Поле | Обязательно | Ограничения |
|------|-------------|-------------|
| `title` | да | непустая строка |
| `image` | нет | jpg, jpeg, png, gif, webp; до 10 МБ |
| `video` | нет | mp4, webm, mov; до 10 МБ |

Ответ `201`. В БД сразу ставится `status = 'draft'`, а в `image_url` / `video_url` кладётся только имя файла из MinIO.

```bash
curl -X POST http://localhost:3000/api/services -F "title=Опыт №1" -F "image=@photo.jpg"
```

**`POST /api/services/:id/image`** — заменяет картинку. Старый файл при этом удаляется из MinIO. Менять может только автор опыта, иначе `403`.

**`PUT /api/services/:id/publish`** — публикует черновик. Тело — JSON:

| Поле | Обязательно | Ограничения |
|------|-------------|-------------|
| `description` | нет | строка |
| `ph` | нет | число от 0 до 14 |
| `concentration` | нет | число ≥ 0 |

Сервер сам ставит `status = 'published'`, `formed_at = NOW()` и `moderator_id`. Эти поля из запроса принять нельзя — вернуться из `published` в `draft` нельзя, попытка даёт `400`.

**`DELETE /api/services/:id`** — запись физически остаётся в БД, но получает `status = 'deleted'` и пропадает из всех списков. Ответ: `{"id": 1, "status": "deleted"}`.

**`POST /api/services/:id/like`** — тело `{"value": 1}` поставить лайк, `{"value": 0}` снять. Значение может быть только 0 или 1, иначе `400`. Повторный лайк не создаёт дубль — за это отвечает уникальный индекс в БД. Ответ: `{"liked": true, "likes_count": 4}`.

**`POST /api/users/register`** — тело `{"username": "ivanov"}`. Имя должно быть непустым и уникальным, иначе `400` или `409`.

**`POST /api/users/login`** и **`POST /api/users/logout`** — заглушки под лабораторную №4, всегда возвращают `{"message": "...", "stub": true}`.

### SSR-маршруты

Отдают HTML, а не JSON.

**`GET /grid`** — берёт из БД опубликованные записи и считает лайки:

```sql
SELECT t.*, COUNT(l.id) AS likes_count
FROM titrations t
LEFT JOIN likes l ON t.id = l.titration_id
WHERE t.status = 'published'
GROUP BY t.id ORDER BY t.id ASC;
```

**`GET /add`** — одна страница, но на ней два шага. Если черновика ещё нет — показывается поле для названия. Если есть — поля для медиа, описания, pH и концентрации.

**`POST /add/step1`** — принимает `title` и создаёт черновик со значениями по умолчанию (`ph = 7.0`, `concentration = 0.10`, `creator_id = 1`). Пустое название заменяется на «Новый опыт».

**`POST /add/publish`** — если в теле есть `id`, обновляет черновик, иначе вставляет новую запись. Принимает `id`, `title`, `description`, `ph`, `concentration`, `image_url`, `video_url` и файлы `image`, `video`. Файлы грузятся в MinIO под именем `<время>-<исходное имя>`.

**`POST /delete`** — принимает `id` и делает `UPDATE titrations SET status = 'deleted'`.

**`GET /feed/:id`** — если `:id` не найден среди опубликованных, бросается `404`.

### Что может вернуться вместо успеха

| Код | Когда |
|-----|-------|
| `400` | Не прошла валидация, лишние поля в запросе, нельзя опубликовать не-черновик |
| `403` | Действует не автор опыта |
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
| `creator_id` | `INT` | `NOT NULL`, внешний ключ на `users(id)` | кто создал |
| `moderator_id` | `INT` | может быть `NULL` | служебное поле, ставится при публикации |

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

`scripts/seed.sql` создаёт пользователя `(1, 'admin')` — он же считается текущим, — 6 опубликованных опытов и 4 лайка.

### Что стоит знать

Колонка `moderator_id` есть в `titration.entity.ts` и используется при публикации, но в `scripts/seed.sql` её нет. Так как `DB_SYNCHRONIZE=false`, на чистой базе её нужно добавить руками:

```sql
ALTER TABLE titrations ADD COLUMN IF NOT EXISTS moderator_id INT NULL;
```

---

## DTO

Входные данные проверяются глобальным `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`). Если в запросе есть поле, которого нет в DTO, приходит `400`.

| DTO | Поле | Правила |
|-----|------|---------|
| `CreateServiceDto` | `title` | строка, непустая |
| `PublishServiceDto` | `description` | строка |
| | `ph` | число 0…14 |
| | `concentration` | число ≥ 0 |
| `LikeDto` | `value` | только 0 или 1 |
| `RegisterUserDto` | `username` | строка, непустая |
| `ServiceFiltersDto` | `minConcentration` | число ≥ 0 |

Системные поля (`id`, `status`, `creator_id`, `moderator_id`, даты) от клиента не принимаются.

---

## Модели

Модели — это классы TypeORM из `src/titration/entities/`. Каждый класс соответствует одной таблице в PostgreSQL: первичный ключ помечен `@PrimaryGeneratedColumn()`, связи — `@ManyToOne` вместе с `@JoinColumn`, а колонка `created_at` заполняется сама базой через `@CreateDateColumn()`.

| Модель | Таблица | Файл |
|--------|---------|------|
| `User` | `users` | `src/titration/entities/user.entity.ts` |
| `Titration` | `titrations` | `src/titration/entities/titration.entity.ts` |
| `Like` | `likes` | `src/titration/entities/like.entity.ts` |

**`User`** — самая простая модель: `id`, `username` (`VARCHAR(50)`, уникальный) и `created_at`.

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
| `moderator_id` | служебное поле, ставится при публикации |
| `creator` | связь с `User` по колонке `creator_id` |

Поля `moderator_id` и `creator` помечены `@Exclude()`. В `main.ts` (строка 33) глобально подключён `ClassSerializerInterceptor`, поэтому при прямой отдаче сущности в JSON системные поля наружу не уходят.

**`Like`** — таблица-связь: `user` ссылается на `users.id`, `titration` — на `titrations.id`. На уровне класса стоит `@Unique(['user', 'titration'])`, поэтому один пользователь не может поставить два лайка одному опыту.

Все три внешних ключа объявлены с `onDelete: 'RESTRICT'` — каскадного удаления нет, нельзя удалить пользователя или опыт, пока на них кто-то ссылается.

---

## Сериализаторы

Модель нельзя отдавать клиенту как есть: в ней лежат системные поля, которые не должны редактироваться, а в `image_url` и `video_url` хранится не ссылка, а имя файла. Поэтому в `src/api/serializers.ts` лежат отдельные функции.

| Функция | Строки | Что делает |
|---------|--------|------------|
| `fileUrl(value)` | 18–22 | из имени файла собирает публичный адрес `http://localhost:9000/titration/<файл>`; если пришёл уже готовый URL — не трогает его |
| `serializeService(row, likesCount)` | 38–52 | модель `Titration` → объект `ServiceDto` |
| `serializeUser(row)` | 60–66 | модель `User` → объект `UserDto` |

Что именно делает `serializeService`:

- оставляет только разрешённые поля — `moderator_id` и `creator_id` в ответе нет;
- превращает `image_url` и `video_url` в готовые ссылки через `fileUrl`;
- добавляет `likes_count` — количество лайков, которого в таблице `titrations` вообще нет, оно приходит вторым аргументом;
- приводит `id`, `ph` и `concentration` к типу `Number`, а пустые значения — к `null`.

Возвращается не экземпляр класса, а обычный объект `ServiceDto` — так TypeScript проверяет, что реальная форма ответа совпадает с описанием. Вызывается в `api.service.ts`: строки 54, 103, 133, 172, 211 и 285.

У SSR-слоя своя вёрстка данных: в `app.service.ts` есть отдельные приватные `getFileUrl()` (строка 63) и `formatPair()` (строка 69), которые кладут в шаблон то, что ожидают `grid.hbs`, `add.hbs` и `feed.hbs`. Общего сериализатора у двух слоёв нет намеренно — у них разные формы ответа.

---

## Текущий пользователь: функция-singleton

Полноценной авторизации в этой лабораторной нет, поэтому создатель опыта зафиксирован константой. Функция лежит в `src/api/current-user.ts`:

```ts
let instance: AuthUser | null = null;

export function currentUser(): AuthUser {
  if (!instance) {
    // Константа текущего (создающего) пользователя
    instance = { id: 1, username: 'admin' };
  }
  return instance;
}
```

Это singleton: `instance` создаётся один раз лениво, при первом вызове, и дальше переиспользуется всеми методами сервиса — на каждый запрос новый объект не заводится. Значение `id = 1` совпадает с пользователем из `scripts/seed.sql`.

Функция вызывается в шести методах `ApiService` (`src/api/api.service.ts`):

| Строка | Метод | Как используется |
|--------|-------|------------------|
| 87 | `getDraft()` | ищет черновик: `where: { status: 'draft', creator: { id: user.id } }` |
| 111 | `createDraft()` | сохраняет `creator: { id: user.id }` у новой записи |
| 141 | `uploadImage()` | `if (item.creator?.id !== user.id)` → `403` |
| 180 | `publishDraft()` | та же проверка автора, плюс `moderator_id: user.id` при публикации |
| 219 | `deleteService()` | `if (item.creator?.id !== user.id)` → `403` |
| 238 | `setLike()` | ищет лайк: `where: { user: { id: user.id }, titration: { id } }` |

Проверки прав работают как обычно, но всегда от имени пользователя `admin` — это ожидаемое поведение заглушки, полноценная авторизация будет в лабораторной №4.

## Файлы в MinIO

Бакет `titration`, доступ по адресу `http://localhost:9000/titration/<имя файла>`. Ограничение — 10 МБ, принимаются jpg, jpeg, png, gif, webp (картинки) и mp4, webm, mov (видео). В базе лежит только имя файла, полный URL собирается на лету. Если у опыта нет медиа, подставляются заглушки `public/img/default-image.jpg` и `public/img/default-video.mp4`.

Кто сейчас «залогинен» — см. раздел «Текущий пользователь: функция-singleton».

## Структура проекта

```text
src/
├── main.ts                 запуск: hbs, статика, валидация, CORS
├── app.module.ts           ConfigModule + TypeOrmModule + ApiModule
├── app.controller.ts       SSR-маршруты
├── app.service.ts          SSR-логика, прямой SQL
├── api/
│   ├── api.controllers.ts  ServicesController, UsersController
│   ├── api.service.ts      бизнес-логика REST
│   ├── serializers.ts      превращение сущностей в JSON
│   ├── current-user.ts     заглушка текущего пользователя
│   ├── minio.provider.ts   подключение к MinIO
│   └── dto/                DTO для валидации
└── titration/entities/     Titration, User, Like
views/                      grid.hbs, add.hbs, feed.hbs, partials/nav.hbs
public/                     стили и картинки-заглушки
scripts/                    migrate.ts и seed.sql
classes.drawio              диаграмма классов
rhumbs-classes.drawio       диаграмма классов в стиле референса
postman_collection.json     готовые запросы для Postman
```

## Ссылки

- [NestJS](https://docs.nestjs.com/) — [валидация](https://docs.nestjs.com/techniques/validation), [БД](https://docs.nestjs.com/techniques/database)
- [TypeORM](https://typeorm.io/) — [сущности](https://typeorm.io/entities)
- [PostgreSQL](https://www.postgresql.org/docs/current/sql.html)
- [MinIO](https://min.io/docs/minio/linux/index.html)
