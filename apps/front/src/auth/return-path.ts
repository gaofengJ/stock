/* eslint-disable no-control-regex -- Reject control bytes in navigation targets. */
/** Only retain same-site navigation. Credentials and external URLs never belong here. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')
    || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u0020]/.test(decoded)) return null;
    const url = new URL(value, 'https://stock.invalid');
    if (url.origin !== 'https://stock.invalid' || /^\/(?:login|register|api)(?:\/|$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export function loginPath() {
  const next = typeof window === 'undefined' ? null : safeReturnPath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}

export function requestedReturnPath() {
  return typeof window === 'undefined' ? null : safeReturnPath(new URLSearchParams(window.location.search).get('next'));
}
