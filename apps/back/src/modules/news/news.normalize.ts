import { createHash } from 'crypto';
import { NewsSource } from './news.sources';

export function plainText(value: unknown, max = 12000): string {
  if (typeof value !== 'string') return '';
  const input = value.slice(0, 100000);
  return (
    input
      .replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\s*(?:br\b[^>]*|\/p|\/div|\/li)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(
        /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
        (_, entity: string) => {
          const known: Record<string, string> = {
            amp: '&',
            lt: '<',
            gt: '>',
            quot: '"',
            apos: "'",
            nbsp: ' ',
          };
          if (entity[0] !== '#') return known[entity.toLowerCase()] || '';
          const n =
            entity[1].toLowerCase() === 'x'
              ? parseInt(entity.slice(2), 16)
              : parseInt(entity.slice(1), 10);
          return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
            ? String.fromCodePoint(n)
            : '';
        },
      )
      // eslint-disable-next-line no-control-regex -- Remove control bytes from untrusted feeds.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim()
      .slice(0, max)
  );
}

export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function normalizeNews(
  raw: unknown,
  source: NewsSource,
  now = new Date(),
) {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const body = plainText(
    item.content_text || item.content_html || item.summary,
  );
  const title = plainText(item.title, 512) || body.slice(0, 160);
  if (!title) return null;
  const url = safeUrl(item.url);
  const date =
    typeof item.date_published === 'string'
      ? new Date(item.date_published)
      : now;
  if (
    !Number.isFinite(date.getTime()) ||
    date.getTime() > now.getTime() + 300000
  )
    return null;
  const identity =
    typeof item.id === 'string' && item.id.trim()
      ? item.id.trim().slice(0, 2048)
      : url || `${title}|${date.toISOString().slice(0, 10)}`;
  return {
    key: createHash('sha256').update(identity).digest('hex'),
    title,
    body,
    url,
    date,
    kind: source.kind,
  };
}

export const sqlDate = (date: Date) =>
  date.toISOString().slice(0, 23).replace('T', ' ');
export const isoDate = (date: Date | string | null) =>
  date ? new Date(date).toISOString() : null;
