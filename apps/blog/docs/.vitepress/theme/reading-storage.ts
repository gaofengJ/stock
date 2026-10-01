export type Reading = { path: string; title: string; scroll: number; updated: number };
const KEY = 'stock-blog-reading:v1';
const RETENTION = 30 * 86400000;
export function safeArticlePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/blog-frame/')) return false;
  try {
    const path = decodeURIComponent(value);
    return !/[\\?\x00-\x20]/.test(path) && !path.split('#')[0].split('/').some(p => p === '.' || p === '..');
  } catch { return false; }
}
export function readings(): Reading[] {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(items)) return [];
    const valid = items.filter(item => safeArticlePath(item?.path) && typeof item.title === 'string' && Number.isFinite(item.scroll) && item.scroll >= 0 && Number.isFinite(item.updated) && Date.now() - item.updated < RETENTION && item.updated <= Date.now());
    localStorage.setItem(KEY, JSON.stringify(valid.slice(0, 40)));
    return valid.slice(0, 40);
  } catch { return []; }
}
export function remember(item: Reading) {
  try {
    if (!safeArticlePath(item.path)) return;
    localStorage.setItem(KEY, JSON.stringify([item, ...readings().filter(previous => previous.path !== item.path)].slice(0, 40)));
  } catch { /* Reading works when browser storage is unavailable. */ }
}
