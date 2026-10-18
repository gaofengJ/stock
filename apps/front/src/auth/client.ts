import { readApiResponse, userError } from '@/api/errors';
import { basicNavigationOrder } from '@/components/Layout/enum';
import { RequestOptions, withRequestDeadline } from './request-deadline';

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
let credentialGeneration = 0;
export function clearCredential() {
  credentialGeneration += 1;
  csrf = undefined;
  pending = undefined;
  accessPending = undefined;
}
export async function csrfToken(options: RequestOptions = {}): Promise<string> {
  if (csrf) return csrf;
  if (!pending) {
    const generation = credentialGeneration;
    const request = withRequestDeadline(async (signal) => {
      const r = await fetch('/api/auth/csrf', { credentials: 'include', cache: 'no-store', signal });
      const b = await readApiResponse(r);
      if (typeof b.data?.csrfToken !== 'string' || !b.data.csrfToken) throw new Error('无法建立安全会话，请刷新页面后重试');
      signal.throwIfAborted();
      if (generation !== credentialGeneration) throw new Error('登录状态已变更，请重试');
      csrf = b.data.csrfToken;
      return csrf!;
    })
      .catch((error: unknown) => { throw userError(error); })
      .finally(() => {
        if (pending === request) pending = undefined;
      });
    pending = request;
  }
  // A cancelled caller must not cancel CSRF initialization used by other callers.
  const shared = pending;
  return withRequestDeadline(() => shared, options);
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
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await withRequestDeadline(async (signal) => {
      const headers: Record<string, string> = body === undefined ? {} : { 'Content-Type': 'application/json' };
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-CSRF-Token'] = await csrfToken({ signal });
      signal.throwIfAborted();
      const r = await fetch(`/api${url}`, {
        method,
        credentials: 'include',
        cache: 'no-store',
        headers,
        signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (notify && !r.ok) authFailure(r.status);
      const b = await readApiResponse(r);
      signal.throwIfAborted();
      if (b.data?.csrfToken) { credentialGeneration += 1; csrf = b.data.csrfToken; accessPending = undefined; }
      return b.data;
    }, options);
  } catch (error) {
    throw userError(error);
  }
}
export function isPersonalAiOwner(user: Account | null): boolean {
  return !!user && user.id === 1 && !user.guest && !user.mustChangePassword
    && !!user.roles?.some((role) => role.code === 'admin');
}
export function allowedPath(user: Account | null, path: string): boolean {
  const p = path.replace(/\/$/, '') || '/';
  if (p === '/admin/ai' || p.startsWith('/admin/ai/')) return isPersonalAiOwner(user);
  if (p === '/trading-system' || p.startsWith('/trading-system/')
    || p === '/admin/playbook' || p.startsWith('/admin/playbook/')) {
    return !!user && !user.guest && !!user.roles?.some((role) => role.code === 'admin');
  }
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
  if (!prefix) {
    const market = user?.catalog.find((p) => p.route === '/analysis/overview' && user.permissions.includes(p.code))
      || user?.catalog.find((p) => p.route?.startsWith('/analysis/') && user.permissions.includes(p.code));
    if (market) return market.route;
  }
  if (prefix === '/trading-system') return allowedPath(user, prefix) ? prefix : '/profile';
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
