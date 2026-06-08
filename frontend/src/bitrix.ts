import type { BitrixAuthPayload } from './types';

declare global {
  interface Window {
    BX24?: {
      init: (callback: () => void) => void;
      getAuth: (callback: (params: any) => void) => void;
    };
  }
}

const AUTH_TIMEOUT_MS = 30_000;
const AUTH_RETRY_DELAY_MS = 2_000;
const MAX_AUTH_RETRIES = 3;

export async function getBitrixAuth(): Promise<BitrixAuthPayload> {
  if (!window.BX24) {
    console.warn('BX24 not found, using local auth');
    return getLocalAuth();
  }

  console.log('Getting auth from BX24...');

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_AUTH_RETRIES; attempt++) {
    try {
      const auth = await tryGetAuth(attempt);
      
      const domain = auth.domain || auth.DOMAIN;
      const accessToken = auth.access_token || auth.ACCESS_TOKEN || auth.AUTH_ID;
      
      if (domain && accessToken) {
        console.log('Auth successful for domain:', domain);
        return { domain, access_token: accessToken };
      }
      
      console.warn(`Auth attempt ${attempt}: missing domain or token, retrying...`, auth);
      lastError = new Error('Битрикс24 не передал данные авторизации.');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown auth error');
      console.warn(`Auth attempt ${attempt} failed:`, lastError.message);
      
      if (attempt < MAX_AUTH_RETRIES) {
        await delay(AUTH_RETRY_DELAY_MS);
      }
    }
  }

  // Если все попытки не удались — пробуем получить auth из URL (на случай если приложение в iframe)
  const urlAuth = tryGetUrlAuth();
  if (urlAuth) {
    console.log('Auth recovered from URL parameters');
    return urlAuth;
  }

  throw lastError || new Error('Timeout getting auth from BX24');
}

function tryGetAuth(attempt: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout getting auth from BX24 (attempt ${attempt})`));
    }, AUTH_TIMEOUT_MS);
    
    if (window.BX24 && typeof window.BX24.getAuth === 'function') {
      window.BX24.getAuth((params: any) => {
        clearTimeout(timeout);
        console.log(`Auth received (attempt ${attempt}):`, params);
        resolve(params);
      });
    } else {
      clearTimeout(timeout);
      reject(new Error('BX24.getAuth is not a function'));
    }
  });
}

function tryGetUrlAuth(): BitrixAuthPayload | null {
  try {
    // Битрикс24 иногда передаёт auth параметры в URL iframe
    const params = new URLSearchParams(window.location.search);
    const domain = params.get('domain') || params.get('DOMAIN');
    const accessToken = params.get('access_token') || params.get('ACCESS_TOKEN') || params.get('AUTH_ID');
    
    if (domain && accessToken) {
      return { domain, access_token: accessToken };
    }
    
    // Проверяем hash-параметры (некоторые версии Битрикс24 передают auth в hash)
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
      const hashDomain = hashParams.get('domain') || hashParams.get('DOMAIN');
      const hashToken = hashParams.get('access_token') || hashParams.get('ACCESS_TOKEN') || hashParams.get('AUTH_ID');
      
      if (hashDomain && hashToken) {
        return { domain: hashDomain, access_token: hashToken };
      }
    }
  } catch {
    // игнорируем ошибки парсинга URL
  }
  
  return null;
}

function getLocalAuth(): BitrixAuthPayload {
  const urlAuth = tryGetUrlAuth();
  if (urlAuth) {
    return urlAuth;
  }

  throw new Error(
    'Для локальной проверки добавьте в адрес параметры domain и access_token или откройте приложение внутри Битрикс24.'
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}