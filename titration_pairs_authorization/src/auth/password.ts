import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * Хеширование паролей (scrypt из стандартной библиотеки Node.js).
 * В БД хранится не пароль, а строка "scrypt$<соль hex>$<хеш hex>":
 * соль у каждого пользователя своя, поэтому одинаковые пароли дают разные хеши.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Проверяет пароль по сохранённой строке; false для пустого/битого хеша. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, saltHex, hashHex] = (stored ?? '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length || KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
