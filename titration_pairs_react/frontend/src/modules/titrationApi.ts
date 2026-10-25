import { TITRATION_PAIRS_MOCK } from './mock'

// Услуга — пара кислоты и щёлочи для титрования (поля как в ответе веб-сервиса)
export interface TitrationPair {
  id: number
  title: string
  description: string | null
  ph: number | null
  concentration: number | null
  image_url: string
  video_url: string
  likes_count: number
}

// Список опубликованных услуг с фильтром по минимальной концентрации.
// Если веб-сервис недоступен — данные из mock-коллекции.
export const getTitrationPairs = async (minConcentration = ''): Promise<TitrationPair[]> => {
  const query = minConcentration ? `?minConcentration=${minConcentration}` : ''
  return fetch(`/api/titration_pairs${query}`)
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status))
      return response.json()
    })
    .catch(() =>
      TITRATION_PAIRS_MOCK.filter(
        (item) => !minConcentration || (item.concentration ?? 0) >= Number(minConcentration),
      ),
    )
}

// Запись ленты: без id — первая услуга, с id — услуга по id,
// с next = true — следующая услуга после этого id (null, если следующей нет).
// Если веб-сервис недоступен — данные из mock-коллекции.
export const getFeedItem = async (id?: string, next = false): Promise<TitrationPair | null> => {
  const url = id
    ? `/api/titration_pairs/feed/${id}${next ? '?next=true' : ''}`
    : '/api/titration_pairs/feed'
  return fetch(url)
    .then((response) => {
      if (response.status === 404) return null
      if (!response.ok) throw new Error(String(response.status))
      return response.json()
    })
    .catch(() => {
      if (!id) return TITRATION_PAIRS_MOCK[0] ?? null
      const index = TITRATION_PAIRS_MOCK.findIndex((item) => String(item.id) === id)
      if (index === -1) return null
      return TITRATION_PAIRS_MOCK[next ? index + 1 : index] ?? null
    })
}
