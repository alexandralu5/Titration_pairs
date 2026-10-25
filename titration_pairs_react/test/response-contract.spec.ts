import { ArgumentsHost, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../src/api/http-exception.filter';
import { serializeFeedService, serializeListService, serializeService } from '../src/api/serializers';

const SERVICE_KEYS = [
  'concentration',
  'created_at',
  'description',
  'formed_at',
  'id',
  'image_url',
  'likes_count',
  'ph',
  'title',
  'video_url',
];

describe('Контракт ответа услуги', () => {
  it('возвращает одинаковый набор полей для полностью пустой строки', () => {
    const dto = serializeService({ id: 7 }, 0);

    expect(Object.keys(dto).sort()).toEqual(SERVICE_KEYS);
    expect(dto).toEqual({
      id: 7,
      title: '',
      description: null,
      ph: null,
      concentration: null,
      image_url: '',
      video_url: '',
      likes_count: 0,
      created_at: null,
      formed_at: null,
    });
  });

  it('возвращает одинаковый набор полей для опубликованной записи', () => {
    const dto = serializeService(
      {
        id: 1,
        title: 'Опыт №1',
        description: 'Кислотный',
        status: 'published',
        ph: '7',
        concentration: 0.5,
        image_url: 'photo.jpg',
        video_url: 'video.mp4',
        created_at: '2026-09-30T10:00:00.000Z',
        formed_at: '2026-09-30T11:00:00.000Z',
      },
      3,
    );

    expect(Object.keys(dto).sort()).toEqual(SERVICE_KEYS);
    expect(dto.ph).toBe(7);
    expect(dto.likes_count).toBe(3);
  });

  it('в базовом ответе (черновик, создание, публикация) нет is_liked и is_mine', () => {
    const dto = serializeService({ id: 1 }, 0);

    expect(dto).not.toHaveProperty('is_liked');
    expect(dto).not.toHaveProperty('is_mine');
  });

  it('лента: базовые поля + is_liked (1/0), без is_mine', () => {
    const liked = serializeFeedService({ id: 1 }, 2, true);
    const notLiked = serializeFeedService({ id: 1 }, 0, false);

    expect(Object.keys(liked).sort()).toEqual([...SERVICE_KEYS, 'is_liked'].sort());
    expect(liked.is_liked).toBe(1);
    expect(notLiked.is_liked).toBe(0);
  });

  it('список: базовые поля + is_mine (1/0), без is_liked', () => {
    const mine = serializeListService({ id: 1 }, 2, true);
    const notMine = serializeListService({ id: 1 }, 0, false);

    expect(Object.keys(mine).sort()).toEqual([...SERVICE_KEYS, 'is_mine'].sort());
    expect(mine.is_mine).toBe(1);
    expect(notMine.is_mine).toBe(0);
  });

  it('не отдаёт status в JSON', () => {
    const dto = serializeService({ id: 1, status: 'draft' }, 0);

    expect(dto).not.toHaveProperty('status');
    expect(Object.keys(dto)).not.toContain('status');
  });
});

describe('Фильтр ошибок', () => {
  function mockHost() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  it.each([
    [new NotFoundException(), 404],
    [new ForbiddenException(), 403],
    [new BadRequestException(['title должен быть строкой']), 400],
    [new Error('boom'), 500],
  ])('отдаёт стандартный код и пустое тело вместо текста ошибки', (exception, code) => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = mockHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(code);
    expect(json).toHaveBeenCalledWith({});
  });
});
