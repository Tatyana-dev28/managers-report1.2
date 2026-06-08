import type { BitrixAuthPayload } from './types';

declare global {
  interface Window {
    BX24?: {
      init: (callback: () => void) => void;
      getAuth: (callback: (params: any) => void) => void;
    };
  }
}

function initBitrix(): Promise<void> {
  return new Promise((resolve) => {
    if (!window.BX24) {
      console.error('BX24 not available');
      resolve(); 
      return;
    }
    
    if (typeof window.BX24.init === 'function') {
      window.BX24.init(() => {
        console.log('BX24.init callback executed');
        resolve();
      });
    } else {
      console.warn('BX24.init is not a function');
      resolve();
    }
  });
}

export async function getBitrixAuth(): Promise<BitrixAuthPayload> {
  if (!window.BX24) {
    console.warn('BX24 not found, using local auth');
    return getLocalAuth();
  }

  console.log('Waiting for BX24 initialization...');
  await initBitrix();
  console.log('BX24 initialized, getting auth...');
  
  const auth = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout getting auth from BX24'));
    }, 5000);
    
    if (window.BX24 && typeof window.BX24.getAuth === 'function') {
      window.BX24.getAuth((params: any) => {
        clearTimeout(timeout);
        console.log('Auth received:', params);
        resolve(params);
      });
    } else {
      clearTimeout(timeout);
      reject(new Error('BX24.getAuth is not a function'));
    }
  });
  
  const domain = auth.domain || auth.DOMAIN;
  const accessToken = auth.access_token || auth.ACCESS_TOKEN || auth.AUTH_ID;
  
  if (!domain || !accessToken) {
    console.error('Invalid auth:', auth);
    throw new Error('Битрикс24 не передал данные авторизации.');
  }
  
  console.log('Auth successful for domain:', domain);
  
  return {
    domain,
    access_token: accessToken,
  };
}

function getLocalAuth(): BitrixAuthPayload {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get('domain');
  const accessToken = params.get('access_token');
  
  if (!domain || !accessToken) {
    throw new Error(
      'Для локальной проверки добавьте в адрес параметры domain и access_token или откройте приложение внутри Битрикс24.'
    );
  }
  
  return {
    domain,
    access_token: accessToken,
  };
}