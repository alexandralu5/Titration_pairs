/**
 * Домен "Пользователь" — авторизация (лабораторная №4 будет полноценной).
 * В данной лабораторной пользователь-создатель ЗАФИКСИРОВАН константой.
 *
 * Функция-singleton "currentUser": возвращает единственный экземпляр
 * авторизованного пользователя. Singleton — потому что объект создаётся один раз
 * (ленивая инициализация) и переиспользуется во всех методах сервиса.
 * Пользователь указан константой: id = 1, username = 'admin'.
 */
export interface AuthUser {
  id: number;
  username: string;
}

let instance: AuthUser | null = null;

export function currentUser(): AuthUser {
  if (!instance) {
    // Константа текущего (создающего) пользователя
    instance = { id: 1, username: 'admin' };
  }
  return instance;
}