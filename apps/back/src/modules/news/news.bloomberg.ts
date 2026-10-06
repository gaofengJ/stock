import { createHash } from 'crypto';
import { readNewsRelay } from './news.relay';

export function bloombergSourceHash(item: Record<string, unknown>) {
  return createHash('sha256')
    .update(`${item.title}\0${item.content_html}`)
    .digest('hex');
}

export function bloombergTranslation(item: Record<string, unknown>) {
  const value = item.translation as Record<string, unknown> | undefined;
  if (
    !value ||
    value.engine !== 'argos' ||
    value.model !== 'en_zh-1.9' ||
    value.source_hash !== bloombergSourceHash(item) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 512 ||
    !/[\u3400-\u9fff]/.test(value.title) ||
    typeof value.body !== 'string' ||
    value.body.length > 12000
  )
    return null;
  return {
    title: value.title,
    body: value.body,
    engine: 'argos',
    model: 'en_zh-1.9',
    sourceHash: bloombergSourceHash(item),
  };
}

export async function readBloombergFeed(
  path: string,
  now = new Date(),
): Promise<unknown[]> {
  return (
    await readNewsRelay(path, 'bloomberg-markets', 'www.bloomberg.com', now)
  ).items;
}
