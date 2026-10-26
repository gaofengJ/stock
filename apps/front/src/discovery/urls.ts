import { siteUrl } from './site';

// Only the two former public website hosts are rewritten. Never rewrite an
// embedded third-party URL, an IP prefix, credentials, or an internal port.
export function normalizeSiteText(value: string): string {
  return value.replace(/(?<![\w/?=&%:@.-])https?:\/\/(?:14\.103\.103\.4|47\.99\.111\.167)(?::(?:80|443))?(?=[/?#\s"'<>()[\]{}，。；：！？、,;!]|$)/g, siteUrl);
}

export function publicSiteLink(path: string): string {
  if (/^\/(?!\/)/.test(path)) return `${siteUrl}${path}`;
  return normalizeSiteText(path);
}

export function normalizeSiteData<T>(value: T): T {
  if (typeof value === 'string') return normalizeSiteText(value) as T;
  if (Array.isArray(value)) return value.map(normalizeSiteData) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeSiteData(item)])) as T;
  return value;
}
