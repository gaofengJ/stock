import { readApiResponse, userError } from '@/api/errors';
import { basicNavigationOrder } from '@/components/Layout/enum';

export interface Permission {
  code: string;
  name: string;
  group: string;
  route: string;
}
export interface Account {
  guest?: boolean;
  id: number;
  username: string;
  nickname: string;
  avatar?: string;
  mustChangePassword: boolean;
  roles: { id: number; code: string; name: string }[];
  permissions: string[];
  catalog: Permission[];
}
export interface AccessState { user: Account | null; trial: { remainingMs: number } | null }
let accessPending: Promise<AccessState> | undefined;
let accessStartsTrial = false;
let csrf: string | undefined;
let pending: Promise<string> | undefined;
export function clearCredential() {
  csrf = undefined;
  pending = undefined;
  accessPending = undefined;
}
export async function csrfToken(): Promise<string> {
  if (csrf) return csrf;
  if (!pending) {
    pending = fetch('/api/auth/csrf', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (r) => {
        const b = await readApiResponse(r);
        if (typeof b.data?.csrfToken !== 'string' || !b.data.csrfToken) throw new Error('无法建立安全会话，请刷新页面后重试');
        csrf = b.data.csrfToken;
        return csrf!;
      })
      .catch((error: unknown) => { throw userError(error); })
      .finally(() => {
        pending = undefined;
      });
  }
  return pending;
}
export function authFailure(status: number) {
  if (typeof window !== 'undefined' && (status === 401 || status === 403)) {
    window.dispatchEvent(
      new CustomEvent('account-http-error', { detail: status }),
    );
  }
}
export async function api<T = any>(
  url: string,
  method = 'GET',
  body: unknown = undefined,
  notify = true,
): Promise<T> {
  const headers: Record<string, string> = body === undefined ? {} : { 'Content-Type': 'application/json' };
  if (!['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = await csrfToken();
  try {
    const r = await fetch(`/api${url}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (notify && !r.ok) authFailure(r.status);
    const b = await readApiResponse(r);
    if (b.data?.csrfToken) { csrf = b.data.csrfToken; accessPending = undefined; }
    return b.data;
  } catch (error) {
    throw userError(error);
  }
}
export function allowedPath(user: Account | null, path: string): boolean {
  const p = path.replace(/\/$/, '') || '/';
  if (p === '/') return !!user;
  if (p === '/profile' || p === '/feedback') return !!user && !user.guest;
  return !!user?.catalog.some(
    (x) => x.route
      && user.permissions.includes(x.code)
      && (x.route === p
        || x.route.startsWith(`${p}/`)
        || p.startsWith(`${x.route}/`)),
  );
}

export function getAccess(startTrial: boolean): Promise<AccessState> {
  if (!accessPending || (startTrial && !accessStartsTrial)) {
    const request = api<AccessState>(`/auth/access?startTrial=${startTrial ? '1' : '0'}`, 'GET', undefined, false)
      .finally(() => { if (accessPending === request) accessPending = undefined; });
    accessPending = request;
    accessStartsTrial = startTrial;
  }
  return accessPending;
}
export function homePath(user: Account | null, prefix = '') {
  if (prefix === '/basic') {
    const first = basicNavigationOrder.find((route) => user?.catalog.some(
      (p) => p.route === route && user.permissions.includes(p.code),
    ));
    if (first) return first;
  }
  return (
    user?.catalog.find(
      (p) => p.route
        && p.route.startsWith(prefix)
        && user.permissions.includes(p.code),
    )?.route || '/profile'
  );
}
