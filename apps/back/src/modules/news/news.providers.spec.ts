import { sinaFlashItems } from './news.providers';
import { normalizeNews } from './news.normalize';
import { sourceByCode } from './news.sources';

describe('Sina public flash feed', () => {
  it('rejects business errors and invalid schemas even on HTTP success', () => {
    expect(() =>
      sinaFlashItems({
        result: { status: { code: 1 }, data: { feed: { list: [] } } },
      }),
    ).toThrow();
    expect(() => sinaFlashItems({})).toThrow();
  });
  it('preserves source time in UTC+8, stable identity and safe original link', () => {
    const [raw] = sinaFlashItems({
      result: {
        status: { code: 0 },
        data: {
          feed: {
            list: [
              {
                id: 123,
                create_time: '2026-10-01 12:30:00',
                rich_text: '<b>市场快讯</b><script>bad()</script>',
              },
            ],
          },
        },
      },
    });
    const item = normalizeNews(
      raw,
      sourceByCode('sina-flash')!,
      new Date('2026-10-01T05:00:00Z'),
    )!;
    expect(item.date.toISOString()).toBe('2026-10-01T04:30:00.000Z');
    expect(item.timeBasis).toBe('published');
    expect(item.title).toBe('市场快讯');
    expect(item.url).toBe('https://wap.cj.sina.cn/pc/7x24/123');
  });
  it('bounds the feed and uses collection time when publication time is absent', () => {
    const raw = sinaFlashItems({
      result: {
        status: { code: 0 },
        data: {
          feed: {
            list: Array.from({ length: 100 }, (_, id) => ({
              id: id + 1,
              rich_text: '快讯',
            })),
          },
        },
      },
    });
    expect(raw).toHaveLength(30);
    expect(normalizeNews(raw[0], sourceByCode('sina-flash')!)?.timeBasis).toBe(
      'collected',
    );
  });
});
