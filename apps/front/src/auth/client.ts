export interface Permission {
  code: string;
  name: string;
  group: string;
  route: string;
}
export interface Account {
  id: number;
  username: string;
  nickname: string;
  avatar?: string;
  mustChangePassword: boolean;
  roles: { id: number; code: string; name: string }[];
  permissions: string[];
  catalog: Permission[];
}
let csrf: string | undefined;
let pending: Promise<string> | undefined;
export function clearCredential() {
  csrf = undefined;
  pending = undefined;
}
export async function csrfToken(): Promise<string> {
  if (csrf) return csrf;
  if (!pending) {
    pending = fetch('/api/auth/csrf', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.message || '无法建立安全会话');
        csrf = b.data.csrfToken;
        return csrf!;
      })
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
  const r = await fetch(`/api${url}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const b = await r.json();
  if (!r.ok || b.code !== 0) {
    if (notify) authFailure(r.status);
    throw new Error(b.message || '请求失败');
  }
  if (b.data?.csrfToken) csrf = b.data.csrfToken;
  return b.data;
}
export function allowedPath(user: Account | null, path: string): boolean {
  const p = path.replace(/\/$/, '') || '/';
  if (['/', '/profile'].includes(p)) return !!user;
  return !!user?.catalog.some(
    (x) => x.route
      && user.permissions.includes(x.code)
      && (x.route === p
        || x.route.startsWith(`${p}/`)
        || p.startsWith(`${x.route}/`)),
  );
}
export function homePath(user: Account | null, prefix = '') {
  return (
    user?.catalog.find(
      (p) => p.route
        && p.route.startsWith(prefix)
        && user.permissions.includes(p.code),
    )?.route || '/profile'
  );
}
