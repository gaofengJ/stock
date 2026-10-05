import dayjs from 'dayjs';

export function profileDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).isValid() && dayjs(value).format('YYYY-MM-DD') === value ? value : '';
}

export function websiteHref(value?: string) {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function profileDateHref(query: string, date: string) {
  const params = new URLSearchParams(query);
  params.set('date', date);
  return `/basic/stock/detail/?${params}`;
}
