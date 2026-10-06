import { open } from 'fs/promises';

export const RELAY_DELAY_MS = 45 * 60000;
export const RELAY_MAX_AGE_MS = 24 * 3600000;

/** Keep delayed public snapshots readable, while preserving their actual fetch time. */
export async function readNewsRelay(
  path: string,
  source: string,
  hostname: string,
  now = new Date(),
) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error('Invalid news relay size');
    const data = JSON.parse(await file.readFile('utf8'));
    const generatedAt = new Date(data.generated_at);
    if (
      data.source !== source ||
      !Number.isFinite(generatedAt.getTime()) ||
      generatedAt.getTime() > now.getTime() + 300000 ||
      now.getTime() - generatedAt.getTime() > RELAY_MAX_AGE_MS ||
      !Array.isArray(data.items) ||
      !data.items.length ||
      data.items.length > 30
    )
      throw new Error('News relay is invalid or stale');
    data.items.forEach((item: any) => {
      const url = new URL(item.url);
      const published = new Date(item.date_published);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== hostname ||
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
        throw new Error('Invalid news relay article');
    });
    return { items: data.items as unknown[], generatedAt };
  } finally {
    await file.close();
  }
}
