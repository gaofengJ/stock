import { MigrationInterface, QueryRunner } from 'typeorm';

export const EXPANDED_NEWS_CODES = [
  'cls',
  'cls-news',
  'wallstreetcn',
  'wscn-news',
  'ths',
  'em-search',
  'em-strategy',
  'em-macro',
  'em-broker',
  'em-industry',
  'em-stock',
  'xueqiu-today',
  'sina-flash',
] as const;

const intervals: Partial<Record<(typeof EXPANDED_NEWS_CODES)[number], number>> =
  {
    'cls-news': 600,
    'wscn-news': 600,
    'em-search': 600,
    'em-strategy': 1800,
    'em-macro': 1800,
    'em-broker': 1800,
    'em-industry': 1800,
    'em-stock': 1800,
    'xueqiu-today': 600,
  };

export class ExpandedNewsSources1790832000000 implements MigrationInterface {
  name = 'ExpandedNewsSources1790832000000';

  async up(q: QueryRunner): Promise<void> {
    // Existing source switches, intervals and collection history remain owned by administrators.
    // eslint-disable-next-line no-restricted-syntax
    for (const code of EXPANDED_NEWS_CODES) {
      // eslint-disable-next-line no-await-in-loop
      await q.query(
        'INSERT IGNORE INTO t_news_source(source,enabled,interval_seconds) VALUES(?,?,?)',
        [code, 1, intervals[code] || 120],
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    // Preserve news and favorites even if source configuration is rolled back.
    await q.query('DELETE FROM t_news_source WHERE source IN (?)', [
      [...EXPANDED_NEWS_CODES],
    ]);
  }
}
