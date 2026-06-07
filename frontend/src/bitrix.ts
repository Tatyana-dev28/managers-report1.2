import type { BitrixAuthPayload } from './types';

type BitrixAuth = {
  domain?: string;
  DOMAIN?: string;
  access_token?: string;
  ACCESS_TOKEN?: string;
  AUTH_ID?: string;
  auth_id?: string;
};

declare global {
  interface Window {
    BX24?: {
      init: (callback: () => void) => void;
      getAuth?: () => BitrixAuth;
    };
  }
}

export async function getBitrixAuth(): Promise<BitrixAuthPayload> {
  if (!window.BX24) {
    return getLocalAuth();
  }

  await withTimeout(initBitrix(), 2000);
  const auth = window.BX24.getAuth?.() ?? {};
  const domain = auth.domain ?? auth.DOMAIN;
  const accessToken = auth.access_token ?? auth.ACCESS_TOKEN ?? auth.AUTH_ID ?? auth.auth_id;

  if (!domain || !accessToken) {
    throw new Error('Битрикс24 не передал данные авторизации приложению.');
  }

  return {
    domain,
    access_token: accessToken,
  };
}

function initBitrix(): Promise<void> {
  return new Promise((resolve) => {
    window.BX24?.init(resolve);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error('Не удалось инициализировать Битрикс24.')),
      timeoutMs,
    );

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function getLocalAuth(): BitrixAuthPayload {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get('domain');
  const accessToken = params.get('access_token');

  if (!domain || !accessToken) {
    throw new Error(
      'Для локальной проверки добавьте в адрес параметры domain и access_token или откройте приложение внутри Битрикс24.',
    );
  }

  return {
    domain,
    access_token: accessToken,
  };
}
