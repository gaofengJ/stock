import { mkdtemp, writeFile, rm, rmdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { readBloombergFeed } from './news.bloomberg';

describe('Bloomberg relay validation', () => {
  const now = new Date('2026-10-01T06:00:00Z');
  let directory: string;
  let path: string;
  const feed = () => ({
    source: 'bloomberg-markets',
    generated_at: now.toISOString(),
    items: [
      {
        id: 'https://www.bloomberg.com/news/articles/example',
        url: 'https://www.bloomberg.com/news/articles/example',
        title: 'Market news',
        content_html: '<p>Public summary</p>',
        date_published: '2026-10-01T05:30:00Z',
      },
    ],
  });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'stock-bloomberg-'));
    path = join(directory, 'feed.json');
  });
  afterEach(async () => {
    await rm(path, { force: true });
    await rmdir(directory);
  });
  it('reads the original publication time without fetching article pages', async () => {
    const expected = feed();
    await writeFile(path, JSON.stringify(expected));
    expect(await readBloombergFeed(path, now)).toEqual(expected.items);
  });
  it('rejects stale snapshots and substituted article origins', async () => {
    const stale = feed();
    stale.generated_at = '2026-10-01T05:00:00Z';
    await writeFile(path, JSON.stringify(stale));
    await expect(readBloombergFeed(path, now)).rejects.toThrow('stale');
    const invalid = feed();
    invalid.items[0].url = 'http://127.0.0.1/private';
    await writeFile(path, JSON.stringify(invalid));
    await expect(readBloombergFeed(path, now)).rejects.toThrow('article');
  });
  it('rejects oversized input before parsing', async () => {
    await writeFile(path, ' '.repeat(1024 * 1024 + 1));
    await expect(readBloombergFeed(path, now)).rejects.toThrow('size');
  });
});
