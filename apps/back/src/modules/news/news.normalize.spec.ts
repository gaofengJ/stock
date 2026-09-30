import { normalizeNews, plainText, safeUrl } from './news.normalize';
import { NEWS_SOURCES } from './news.sources';

describe('News feed normalization', () => {
  const source = NEWS_SOURCES[0];
  const now = new Date('2026-10-01T00:00:00Z');
  it('removes active HTML, decodes entities and bounds untrusted content', () => {
    expect(
      plainText(
        '<script>alert(1)</script><p>标题&amp;&#x4e2d;</p><iframe>x</iframe>',
      ),
    ).toBe('标题&中');
    expect(plainText('a'.repeat(20000))).toHaveLength(12000);
    expect(plainText('&#999999999999;')).toBe('');
  });
  it('rejects executable links and embedded credentials', () => {
    // eslint-disable-next-line no-script-url -- Deliberately malicious test input.
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('https://user:password@example.com')).toBeNull();
    expect(safeUrl('https://example.com/news?id=1')).toBe(
      'https://example.com/news?id=1',
    );
  });
  it('uses stable identity across revised titles and important feeds', () => {
    const a = normalizeNews(
      { id: 'flash-123', title: '原始标题', date_published: now.toISOString() },
      source,
      now,
    )!;
    const b = normalizeNews(
      { id: 'flash-123', title: '修正标题', date_published: now.toISOString() },
      source,
      now,
    )!;
    expect(a.key).toBe(b.key);
    expect(a.key).toMatch(/^[a-f0-9]{64}$/);
  });
  it('skips empty, malformed and future items without crashing', () => {
    expect(normalizeNews(null, source, now)).toBeNull();
    expect(normalizeNews({}, source, now)).toBeNull();
    expect(
      normalizeNews({ title: 'x', date_published: 'bad' }, source, now),
    ).toBeNull();
    expect(
      normalizeNews({ title: 'x', date_published: '2099-01-01' }, source, now),
    ).toBeNull();
  });
});
