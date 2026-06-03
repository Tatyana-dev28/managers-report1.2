import type { AuthUserPayload } from './types';

type BitrixResult<T> = {
  data: () => T;
  error?: () => unknown;
};

type BitrixAuth = {
  domain?: string;
  member_id?: string;
};

type BitrixUser = {
  ID?: string | number;
  NAME?: string;
  LAST_NAME?: string;
};

declare global {
  interface Window {
    BX24?: {
      init: (callback: () => void) => void;
      callMethod: <T>(
        method: string,
        params: Record<string, unknown>,
        callback: (result: BitrixResult<T>) => void,
      ) => void;
      getAuth?: () => BitrixAuth;
      isAdmin?: () => boolean;
    };
  }
}

export async function getBitrixAuthUser(): Promise<AuthUserPayload> {
  if (!window.BX24) {
    return getLocalAuthUser();
  }

  try {
    await withTimeout(initBitrix(), 1500);
    const [currentUser, isAdmin] = await Promise.all([
      callBitrixMethod<BitrixUser>('user.current'),
      getIsAdmin(),
    ]);
    const auth = window.BX24.getAuth?.() ?? {};
    const bitrixUserId = Number(currentUser.ID);

    if (Number.isNaN(bitrixUserId)) {
      throw new Error('Bitrix24 did not return current user ID.');
    }

    return {
      bitrix_user_id: bitrixUserId,
      first_name: currentUser.NAME ?? null,
      last_name: currentUser.LAST_NAME ?? null,
      is_admin: isAdmin,
      domain: auth.domain ?? null,
      member_id: auth.member_id ?? null,
    };
  } catch (error) {
    if (hasLocalAuthParams()) {
      return getLocalAuthUser();
    }

    throw error instanceof Error
      ? error
      : new Error('Failed to get current Bitrix24 user.');
  }
}

function initBitrix(): Promise<void> {
  return new Promise((resolve) => {
    window.BX24?.init(resolve);
  });
}

function callBitrixMethod<T>(method: string): Promise<T> {
  return new Promise((resolve, reject) => {
    window.BX24?.callMethod<T>(method, {}, (result) => {
      if (result.error?.()) {
        reject(result.error?.());
        return;
      }

      resolve(result.data());
    });
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('Bitrix init timeout')), timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

async function getIsAdmin(): Promise<boolean> {
  if (typeof window.BX24?.isAdmin === 'function') {
    return window.BX24.isAdmin();
  }

  try {
    return Boolean(await callBitrixMethod<boolean>('user.admin'));
  } catch {
    return false;
  }
}

function hasLocalAuthParams(): boolean {
  return new URLSearchParams(window.location.search).has('bitrix_user_id');
}

function parseLocalBoolean(value: string | null): boolean {
  return value === 'true' || value === '1';
}

function getLocalAuthUser(): AuthUserPayload {
  const params = new URLSearchParams(window.location.search);
  const rawBitrixUserId = params.get('bitrix_user_id');

  if (!rawBitrixUserId) {
    throw new Error(
      'Bitrix24 user is not available. For local testing, add ?bitrix_user_id=USER_ID to the URL.',
    );
  }

  const bitrixUserId = Number(rawBitrixUserId);
  if (Number.isNaN(bitrixUserId)) {
    throw new Error('Invalid bitrix_user_id URL parameter.');
  }

  const isAdmin = parseLocalBoolean(params.get('is_admin'));

  return {
    bitrix_user_id: bitrixUserId,
    first_name: params.get('first_name') ?? 'Local',
    last_name: params.get('last_name') ?? (isAdmin ? 'Leader' : 'Manager'),
    is_admin: isAdmin,
    domain: params.get('domain') ?? 'local.dev',
    member_id: params.get('member_id'),
  };
}
