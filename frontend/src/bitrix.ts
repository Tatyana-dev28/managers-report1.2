import type { BitrixAuthPayload } from './types';

declare global {
  interface Window {
    BX24?: {
      init: (callback: () => void) => void;
      getAuth: () => { domain: string; access_token: string; [key: string]: any } | null;
      openPath: (path: string, callback?: (result?: unknown) => void) => void;
      openApplication?: (params: Record<string, unknown>, callback?: (result?: unknown) => void) => void;
      placement?: {
        info: () => { options?: Record<string, unknown> };
      };
    };
  }
}

/**
 * Пытается получить auth из параметров URL (query или hash).
 * Битрикс24 иногда передаёт domain и access_token/AUTH_ID в URL iframe.
 */
function tryGetUrlAuth(): BitrixAuthPayload | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const domain = params.get('domain') ?? params.get('DOMAIN');
    const accessToken = params.get('access_token') ?? params.get('ACCESS_TOKEN') ?? params.get('AUTH_ID');

    if (domain && accessToken) {
      return { domain, access_token: accessToken };
    }

    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
      const hashDomain = hashParams.get('domain') ?? hashParams.get('DOMAIN');
      const hashToken = hashParams.get('access_token') ?? hashParams.get('ACCESS_TOKEN') ?? hashParams.get('AUTH_ID');

      if (hashDomain && hashToken) {
        return { domain: hashDomain, access_token: hashToken };
      }
    }
  } catch {
    // игнорируем ошибки парсинга URL
  }

  return null;
}

/**
 * Пытается получить auth через BX24.getAuth() (синхронный вызов).
 * Возвращает null, если BX24 не доступен или не вернул данные.
 */
function tryGetBx24Auth(): BitrixAuthPayload | null {
  if (!window.BX24) {
    return null;
  }

  const auth = window.BX24.getAuth();
  if (!auth) {
    return null;
  }

  const domain = auth.domain;
  const accessToken = auth.access_token;

  if (domain && accessToken) {
    return { domain, access_token: accessToken };
  }

  return null;
}

/**
 * Основная функция получения авторизации.
 *
 * Порядок проверки (как в эталонном проекте app_contacts_without_transactions):
 * 1. Параметры URL (domain + access_token/AUTH_ID) — если есть, используем сразу
 * 2. BX24 SDK (синхронный getAuth()) — если BX24 доступен
 * 3. Если BX24 нет — локальный режим (для разработки вне Битрикс24)
 */
export async function getBitrixAuth(): Promise<BitrixAuthPayload> {
  // Шаг 1: проверяем URL-параметры (самый быстрый способ)
  const urlAuth = tryGetUrlAuth();
  if (urlAuth) {
    console.log('Auth получен из параметров URL');
    return urlAuth;
  }

  // Шаг 2: пробуем BX24 SDK (синхронный вызов, без таймаутов и retry)
  const bx24Auth = tryGetBx24Auth();
  if (bx24Auth) {
    console.log('Auth получен через BX24.getAuth()');
    return bx24Auth;
  }

  // Шаг 3: если BX24 нет — локальный режим
  if (!window.BX24) {
    console.warn('BX24 не найден, используется локальный режим');
    throw new Error(
      'Для локальной проверки добавьте в адрес параметры domain и access_token или откройте приложение внутри Битрикс24.'
    );
  }

  // BX24 есть, но getAuth() не вернул данные — ошибка
  throw new Error('Битрикс24 не передал данные авторизации.');
}