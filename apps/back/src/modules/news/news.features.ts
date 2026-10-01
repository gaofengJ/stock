/* eslint-disable no-restricted-syntax, no-await-in-loop -- Bounded background batches preserve MySQL capacity. */
import { UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NewsPreferences, NewsStockQuery } from './news.dto';
import {
  hashText,
  matchingStocks,
  newsGroup,
  NewsStock,
  RuleCandidate,
} from './news.rules';
import { sqlDate } from './news.normalize';

export class NewsFeatures {
  private stockCache: { expires: number; stocks: NewsStock[] } | null = null;

  constructor(private readonly db: DataSource) {}

  private owner(userId?: number) {
    if (!userId)
      throw new UnauthorizedException('请登录后使用个人关注与已读记录');
    return userId;
  }

  async preferences(userId?: number) {
    const [row] = await this.db.query(
      'SELECT keywords,stocks FROM t_news_preference WHERE user_id=?',
      [this.owner(userId)],
    );
    return {
      keywords: row ? (JSON.parse(row.keywords) as string[]) : [],
      stocks: row ? (JSON.parse(row.stocks) as string[]) : [],
    };
  }

  async savePreferences(dto: NewsPreferences, userId?: number) {
    const keywords = [
      ...new Set(dto.keywords.map((word) => word.trim()).filter(Boolean)),
    ];
    const stocks = [...new Set(dto.stocks)];
    await this.db.query(
      'INSERT INTO t_news_preference(user_id,keywords,stocks) VALUES(?,?,?) ON DUPLICATE KEY UPDATE keywords=VALUES(keywords),stocks=VALUES(stocks)',
      [this.owner(userId), JSON.stringify(keywords), JSON.stringify(stocks)],
    );
    return { keywords, stocks };
  }

  async stockOptions(query: NewsStockQuery) {
    const text = query.q?.trim();
    if (!text) return [];
    const pattern = `%${text.replace(/[!%_]/g, (c) => `!${c}`)}%`;
    return this.db.query(
      "SELECT DISTINCT ts_code tsCode,name FROM t_source_stock WHERE ts_code LIKE ? ESCAPE '!' OR name LIKE ? ESCAPE '!' ORDER BY ts_code LIMIT 20",
      [pattern, pattern],
    );
  }

  async read(ids: number[], userId?: number) {
    const owner = this.owner(userId);
    // ids come from verified news/group members, never from untrusted body input.
    await this.db.query(
      'INSERT IGNORE INTO t_news_read(user_id,news_id,read_at) SELECT ?,id,UTC_TIMESTAMP(3) FROM t_news_item WHERE id IN (?)',
      [owner, ids],
    );
    return { read: true };
  }

  async decorate(items: any[]) {
    if (!items.length) return items;
    const ids = items.map((item) => item.id);
    const stocks = await this.db.query(
      'SELECT DISTINCT x.news_id,s.ts_code tsCode,s.name FROM t_news_stock x JOIN t_source_stock s ON s.ts_code=x.ts_code WHERE x.news_id IN (?) ORDER BY s.ts_code',
      [ids],
    );
    const members = await this.db.query(
      "SELECT a.news_id root,n.id,n.source,n.title,n.original_url FROM t_news_rule a JOIN t_news_rule b ON b.group_key=a.group_key JOIN t_news_item n ON n.id=b.news_id JOIN t_news_source s ON s.source=n.source WHERE a.news_id IN (?) AND s.enabled=1 AND s.last_success IS NOT NULL AND s.status IN ('ok','collecting') AND s.last_error='' ORDER BY n.published_at DESC,n.id DESC",
      [ids],
    );
    return items.map((item) => ({
      ...item,
      stocks: stocks
        .filter((stock: any) => Number(stock.news_id) === item.id)
        .map(({ tsCode, name }: any) => ({ tsCode, name })),
      related: members
        .filter(
          (member: any) =>
            Number(member.root) === item.id && Number(member.id) !== item.id,
        )
        .map(({ id, source, title, original_url: originalUrl }: any) => ({
          id: Number(id),
          source,
          title,
          originalUrl,
        })),
    }));
  }

  async indexBatch(limit = 200) {
    const rows: RuleCandidate[] = await this.db.query(
      'SELECT n.id,n.title,n.body,n.source,n.kind,n.published_at,n.dedupe_key FROM t_news_item n LEFT JOIN t_news_rule r ON r.news_id=n.id WHERE r.news_id IS NULL AND n.published_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 DAY) ORDER BY n.id DESC LIMIT ?',
      [limit],
    );
    if (!rows.length) return;
    if (!this.stockCache || this.stockCache.expires < Date.now()) {
      const stocks: NewsStock[] = await this.db.query(
        'SELECT DISTINCT ts_code tsCode,name,fullname FROM t_source_stock',
      );
      this.stockCache = { stocks, expires: Date.now() + 3600000 };
    }
    const candidates: RuleCandidate[] = await this.db.query(
      'SELECT n.id,n.title,n.source,n.kind,n.published_at,r.group_key FROM t_news_item n JOIN t_news_rule r ON r.news_id=n.id WHERE n.published_at BETWEEN ? AND ? ORDER BY n.id DESC LIMIT 5000',
      [
        sqlDate(
          new Date(
            Math.min(
              ...rows.map((item) => new Date(item.published_at).getTime()),
            ) -
              3 * 3600000,
          ),
        ),
        sqlDate(
          new Date(
            Math.max(
              ...rows.map((item) => new Date(item.published_at).getTime()),
            ) +
              3 * 3600000,
          ),
        ),
      ],
    );
    for (const item of rows) {
      const text = `${item.title}\n${(item as any).body}`;
      const group = newsGroup(item, candidates);
      // This collector holds the news named lock. Publish stock associations before rule marker.
      await this.db.query('DELETE FROM t_news_stock WHERE news_id=?', [
        item.id,
      ]);
      const stocks = matchingStocks(text, this.stockCache.stocks);
      if (stocks.length)
        await this.db.query(
          'INSERT IGNORE INTO t_news_stock(news_id,ts_code) VALUES ?',
          [stocks.map((stock) => [item.id, stock.tsCode])],
        );
      await this.db.query(
        'INSERT INTO t_news_rule(news_id,group_key,text_hash) VALUES(?,?,?) ON DUPLICATE KEY UPDATE group_key=VALUES(group_key),text_hash=VALUES(text_hash)',
        [item.id, group, hashText(text)],
      );
      candidates.unshift({ ...item, group_key: group });
    }
  }
}
