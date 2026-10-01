import { open } from 'fs/promises';
import { createHash } from 'crypto';

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
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error('Invalid Bloomberg feed size');
    const data = JSON.parse(await file.readFile('utf8'));
    const generated = new Date(data.generated_at);
    if (
      data.source !== 'bloomberg-markets' ||
      !Number.isFinite(generated.getTime()) ||
      generated.getTime() > now.getTime() + 300000 ||
      now.getTime() - generated.getTime() > 45 * 60000 ||
      !Array.isArray(data.items) ||
      !data.items.length ||
      data.items.length > 30
    )
      throw new Error('Bloomberg relay is invalid or stale');
    data.items.forEach((item: any) => {
      const url = new URL(item.url);
      const published = new Date(item.date_published);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'www.bloomberg.com' ||
        url.username ||
        url.password ||
        typeof item.title !== 'string' ||
        !item.title.trim() ||
        item.title.length > 512 ||
        typeof item.content_html !== 'string' ||
        item.content_html.length > 12000 ||
        item.id !== item.url ||
        item.url.length > 2048 ||
        !Number.isFinite(published.getTime()) ||
        published.getTime() > now.getTime() + 300000
      )
        throw new Error('Invalid Bloomberg relay article');
    });
    return data.items;
  } finally {
    await file.close();
  }
}
