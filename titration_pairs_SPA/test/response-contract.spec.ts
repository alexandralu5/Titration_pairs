import { ArgumentsHost, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../src/api/http-exception.filter';
import { serializeService } from '../src/api/serializers';

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
