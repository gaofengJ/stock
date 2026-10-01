/* eslint-disable no-restricted-syntax, no-await-in-loop -- Bounded sequential writes and two feed workers limit upstream and database pressure. */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { DataSource, QueryRunner } from 'typeorm';
import {
  NEWS_SOURCES,
  NewsSource,
  sourceByCode,
  isNewsSource,
} from './news.sources';
import { isoDate, normalizeNews, sqlDate } from './news.normalize';
import {
  NewsQuery,
  NewsSourceUpdate,
  NewsPreferences,
  NewsStockQuery,
} from './news.dto';
import { NewsFeatures } from './news.features';
import { hashText } from './news.rules';
import { checkNewsSchema } from './news-schema';
import { sinaFlashItems } from './news.providers';
import { readBloombergFeed } from './news.bloomberg';

const NEWS_CODES = NEWS_SOURCES.filter(isNewsSource).map(
  (source) => source.code,
);
const DISPLAYABLE_SOURCE_SQL =
  "s.enabled=1 AND s.last_success IS NOT NULL AND s.status IN ('ok','collecting') AND s.last_error=''";

@Injectable()
export class NewsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NewsService.name);

  private busy = false;

  private readonly baseUrl: string;

  private readonly enabled: boolean;

  private readonly bloombergFeedFile: string;

  readonly features: NewsFeatures;

  constructor(
    private readonly db: DataSource,
    config: ConfigService,
  ) {
    this.features = new NewsFeatures(db);
    this.baseUrl = String(
      config.get('RSSHUB_BASE_URL') ||
        (process.env.NODE_ENV === 'production'
          ? 'http://rsshub:1200'
          : 'http://127.0.0.1:1200'),
    ).replace(/\/$/, '');
    this.enabled =
      String(
        config.get('NEWS_SYNC_ENABLED') ??
          process.env.NODE_ENV === 'production',
      ) === 'true';
    this.bloombergFeedFile = String(
      config.get('BLOOMBERG_FEED_FILE') ||
        '/run/stock/news-feeds/bloomberg.json',
    );
  }

  async onApplicationBootstrap() {
    await checkNewsSchema(this.db);
    if (this.enabled) this.launch(false);
  }

  @Cron('*/30 * * * * *')
  tick() {
    if (this.enabled) this.launch(false);
  }

  private launch(force: boolean) {
    this.sync(force).catch(() =>
      this.logger.error('资讯采集任务执行失败，请检查数据库与 RSSHub 服务'),
    );
  }

  requestSync() {
    if (!this.enabled) throw new BadRequestException('资讯采集未启用');
    this.launch(true);
    return { queued: true, message: '已提交采集任务，稍后刷新查看来源状态' };
  }

  async sources(includeUnavailable = false) {
    const rows = await this.db.query('SELECT * FROM t_news_source');
    return {
      collecting: this.busy,
      sources: NEWS_SOURCES.filter(isNewsSource)
        .map((s) => {
          const row = rows.find((r: any) => r.source === s.code);
          return {
            code: s.code,
            name: s.name,
            kind: s.kind,
            availabilityNote: s.availabilityNote || '',
            description: s.description || '',
            enabled: Boolean(row?.enabled),
            intervalSeconds: Number(row?.interval_seconds || 120),
            status: row?.status || 'pending',
            lastAttempt: isoDate(row?.last_attempt || null),
            lastSuccess: isoDate(row?.last_success || null),
            nextAttempt: isoDate(row?.next_attempt || null),
            lastError: row?.last_error || '',
            lastAdded: Number(row?.last_added || 0),
          };
        })
        .filter(
          (s) =>
            includeUnavailable ||
            (s.enabled &&
              s.lastSuccess &&
              ['ok', 'collecting'].includes(s.status) &&
              !s.lastError),
        ),
    };
  }

  async updateSource(code: string, dto: NewsSourceUpdate) {
    if (!sourceByCode(code)) throw new BadRequestException('未知资讯来源');
    if (!isNewsSource(sourceByCode(code)))
      throw new BadRequestException('研报来源不参与实时资讯');
    const sets: string[] = [];
    const args: any[] = [];
    if (dto.enabled !== undefined) {
      sets.push('enabled=?');
      args.push(dto.enabled ? 1 : 0);
    }
    if (dto.intervalSeconds !== undefined) {
      sets.push('interval_seconds=?');
      args.push(dto.intervalSeconds);
    }
    if (!sets.length) throw new BadRequestException('请选择要修改的配置');
    await this.db.query(
      `UPDATE t_news_source SET ${sets.join(
        ',',
      )},next_attempt=NULL WHERE source=?`,
      [...args, code],
    );
    return this.sources(true);
  }

  async list(query: NewsQuery, userId?: number) {
    const favorites = query.favorites === 'true';
    if (favorites && !userId)
      throw new UnauthorizedException('请登录后查看收藏');
    if (query.source && !sourceByCode(query.source))
      throw new BadRequestException('未知资讯来源');
    const clauses = [`n.source IN (${NEWS_CODES.map(() => '?').join(',')})`];
    const args: any[] = [...NEWS_CODES];
    if (!favorites) clauses.push(DISPLAYABLE_SOURCE_SQL);
    const date =
      query.date ||
      (favorites
        ? ''
        : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
    if (query.range === 'hour') {
      clauses.push(
        'n.published_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR) AND n.published_at<=UTC_TIMESTAMP(3)',
      );
    } else if (query.range === 'today' || query.range === 'three-days') {
      const today = new Date(
        `${new Date(Date.now() + 8 * 3600000)
          .toISOString()
          .slice(0, 10)}T00:00:00+08:00`,
      );
      clauses.push('n.published_at>=? AND n.published_at<?');
      args.push(
        sqlDate(
          new Date(
            today.getTime() - (query.range === 'three-days' ? 2 * 86400000 : 0),
          ),
        ),
        sqlDate(new Date(today.getTime() + 86400000)),
      );
    } else if (date) {
      const start = new Date(`${date}T00:00:00+08:00`);
      if (
        !Number.isFinite(start.getTime()) ||
        new Date(start.getTime() + 8 * 3600000).toISOString().slice(0, 10) !==
          date
      )
        throw new BadRequestException('日期无效');
      clauses.push('n.published_at>=? AND n.published_at<?');
      args.push(sqlDate(start), sqlDate(new Date(start.getTime() + 86400000)));
    }
    if (query.source) {
      clauses.push('n.source=?');
      args.push(query.source);
    }
    if (query.kind) {
      clauses.push('n.kind=?');
      args.push(query.kind);
    }
    if (query.important === 'true') clauses.push('n.important=1');
    if (query.keyword?.trim()) {
      clauses.push(
        "(n.title LIKE ? ESCAPE '!' OR n.body LIKE ? ESCAPE '!' OR t.title LIKE ? ESCAPE '!' OR t.body LIKE ? ESCAPE '!')",
      );
      const pattern = `%${query.keyword
        .trim()
        .replace(/[!%_]/g, (c) => `!${c}`)}%`;
      args.push(pattern, pattern, pattern, pattern);
    }
    if (query.stock) {
      clauses.push(
        'EXISTS(SELECT 1 FROM t_news_stock x WHERE x.news_id=n.id AND x.ts_code=?)',
      );
      args.push(query.stock);
    }
    if (query.following === 'true' || query.watchlist === 'true') {
      const preferences = await this.features.preferences(userId);
      if (query.watchlist === 'true') {
        if (!preferences.stocks.length) clauses.push('0=1');
        else {
          clauses.push(
            `EXISTS(SELECT 1 FROM t_news_stock x WHERE x.news_id=n.id AND x.ts_code IN (${preferences.stocks
              .map(() => '?')
              .join(',')}))`,
          );
          args.push(...preferences.stocks);
        }
      }
      if (query.following === 'true') {
        if (!preferences.keywords.length) clauses.push('0=1');
        else {
          clauses.push(
            `(${preferences.keywords
              .map(
                () =>
                  "(n.title LIKE ? ESCAPE '!' OR n.body LIKE ? ESCAPE '!' OR t.title LIKE ? ESCAPE '!' OR t.body LIKE ? ESCAPE '!')",
              )
              .join(' OR ')})`,
          );
          preferences.keywords.forEach((word) => {
            const pattern = `%${word.replace(/[!%_]/g, (c) => `!${c}`)}%`;
            args.push(pattern, pattern, pattern, pattern);
          });
        }
      }
    }
    const join = `${
      favorites ? '' : 'JOIN t_news_source s ON s.source=n.source '
    }LEFT JOIN t_news_translation t ON t.news_id=n.id LEFT JOIN t_news_rule r ON r.news_id=n.id LEFT JOIN t_news_favorite f ON f.news_id=n.id AND f.user_id=?`;
    if (favorites) clauses.push('f.news_id IS NOT NULL');
    const where = clauses.join(' AND ');
    const group =
      query.merge === 'true' && !favorites
        ? "COALESCE(r.group_key,CONCAT('id:',n.id))"
        : 'n.id';
    const groups = `SELECT MAX(n.id) id,MAX(n.published_at) newest,MAX(n.important) group_important FROM t_news_item n ${join} WHERE ${where} GROUP BY ${group}`;
    const [{ total, latestId, newCount }] = await this.db.query(
      `SELECT COUNT(*) total,COALESCE(MAX(g.id),0) latestId,COALESCE(SUM(g.id>?),0) newCount FROM (${groups}) g`,
      [query.afterId ?? 2147483647, userId || 0, ...args],
    );
    const rows = await this.db.query(
      `SELECT n.id,n.source,n.kind,n.title,LEFT(n.body,360) body,n.original_url,g.group_important important,n.published_at,n.time_basis,t.title translated_title,LEFT(t.body,360) translated_body,t.engine translation_engine,t.model translation_model,(f.news_id IS NOT NULL) favorite,(v.news_id IS NOT NULL) already_read FROM t_news_item n JOIN (${groups}) g ON g.id=n.id LEFT JOIN t_news_translation t ON t.news_id=n.id LEFT JOIN t_news_favorite f ON f.news_id=n.id AND f.user_id=? LEFT JOIN t_news_read v ON v.news_id=n.id AND v.user_id=? ORDER BY g.newest DESC,n.id DESC LIMIT ? OFFSET ?`,
      [
        userId || 0,
        ...args,
        userId || 0,
        userId || 0,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ],
    );
    return {
      items: await this.features.decorate(
        rows.map((r: any) => this.present(r)),
      ),
      total: Number(total),
      latestId: Number(latestId || 0),
      newCount: query.afterId === undefined ? 0 : Number(newCount || 0),
      page: query.page,
      pageSize: query.pageSize,
      date,
      updatedAt: new Date().toISOString(),
    };
  }

  private present(row: any) {
    return {
      id: Number(row.id),
      source: row.source,
      sourceName: sourceByCode(row.source)?.name || row.source,
      kind: row.kind,
      title: row.title,
      body: row.body,
      originalUrl: row.original_url,
      important: Number(row.important || 0) === 1,
      publishedAt: isoDate(row.published_at),
      timeBasis: row.time_basis || 'published',
      favorite: Number(row.favorite || 0) === 1,
      read: Number(row.already_read || 0) === 1,
      translation: row.translated_title
        ? {
            title: row.translated_title,
            body: row.translated_body || '',
            engine: row.translation_engine,
            model: row.translation_model,
          }
        : null,
    };
  }

  async detail(id: number, userId?: number) {
    const [row] = await this.db.query(
      'SELECT n.*,t.title translated_title,t.body translated_body,t.engine translation_engine,t.model translation_model,(f.news_id IS NOT NULL) favorite,(v.news_id IS NOT NULL) already_read FROM t_news_item n LEFT JOIN t_news_translation t ON t.news_id=n.id LEFT JOIN t_news_favorite f ON f.news_id=n.id AND f.user_id=? LEFT JOIN t_news_read v ON v.news_id=n.id AND v.user_id=? WHERE n.id=?',
      [userId || 0, userId || 0, id],
    );
    if (!row) throw new NotFoundException('资讯不存在或已过期');
    const [item] = await this.features.decorate([this.present(row)]);
    return item;
  }

  preferences(userId?: number) {
    return this.features.preferences(userId);
  }

  savePreferences(dto: NewsPreferences, userId?: number) {
    return this.features.savePreferences(dto, userId);
  }

  stockOptions(query: NewsStockQuery) {
    return this.features.stockOptions(query);
  }

  async markRead(id: number, userId?: number) {
    const item = await this.detail(id, userId);
    return this.features.read(
      [id, ...item.related.map((related: any) => related.id)],
      userId,
    );
  }

  async favorite(id: number, userId: number | undefined, add: boolean) {
    if (!userId) throw new UnauthorizedException('请登录后收藏');
    await this.detail(id, userId);
    if (add)
      await this.db.query(
        'INSERT IGNORE INTO t_news_favorite(user_id,news_id,created_at) VALUES(?,?,UTC_TIMESTAMP(3))',
        [userId, id],
      );
    else
      await this.db.query(
        'DELETE FROM t_news_favorite WHERE user_id=? AND news_id=?',
        [userId, id],
      );
    return { favorite: add };
  }

  private async fetch(path: string): Promise<unknown[]> {
    const response = await axios.get(`${this.baseUrl}${path}`, {
      params: { format: 'json', limit: 30 },
      timeout: 45000,
      maxRedirects: 0,
      maxContentLength: 4 * 1024 * 1024,
      maxBodyLength: 4 * 1024 * 1024,
      proxy: false,
    });
    if (!response.data || !Array.isArray(response.data.items))
      throw new Error('Invalid JSON feed');
    return response.data.items.slice(0, 50);
  }

  private async fetchSource(source: NewsSource): Promise<unknown[]> {
    if (source.provider === 'bloomberg-relay')
      return readBloombergFeed(this.bloombergFeedFile);
    if (source.provider !== 'sina-flash') return this.fetch(source.path);
    const response = await axios.get('https://app.cj.sina.com.cn/api/news/pc', {
      params: { page: 1, size: 30, tag: 0 },
      headers: { Referer: 'https://finance.sina.com.cn/7x24/' },
      timeout: 15000,
      maxRedirects: 0,
      maxContentLength: 4 * 1024 * 1024,
      maxBodyLength: 4 * 1024 * 1024,
      proxy: false,
    });
    return sinaFlashItems(response.data);
  }

  private async collect(source: NewsSource, row: any, q: QueryRunner) {
    await q.query(
      "UPDATE t_news_source SET last_attempt=UTC_TIMESTAMP(3),status='collecting' WHERE source=?",
      [source.code],
    );
    try {
      const items = await this.fetchSource(source);
      // Match each provider's dedicated important feed by normalized identity.
      const important = new Set<string>();
      if (source.importantPath) {
        try {
          const highlights = await this.fetch(source.importantPath);
          highlights.forEach((raw) => {
            const item = normalizeNews(raw, source);
            if (item) {
              important.add(item.key);
              items.push(raw);
            }
          });
        } catch {
          this.logger.warn(`${source.name}重点资讯暂不可用，普通快讯继续采集`);
        }
      }
      const normalized = items
        .map((raw) => normalizeNews(raw, source))
        .filter(
          (item): item is NonNullable<ReturnType<typeof normalizeNews>> =>
            item !== null,
        );
      if (items.length && !normalized.length)
        throw new Error('Invalid feed items');
      let added = 0;
      for (const item of normalized) {
        // Publish English changes and their matching translation as one unit.
        if (item.sourceHash) await q.startTransaction();
        try {
          // A changed headline/body invalidates only its derived rules, not source history.
          await q.query(
            'DELETE x FROM t_news_stock x JOIN t_news_rule r ON r.news_id=x.news_id JOIN t_news_item n ON n.id=r.news_id WHERE n.source=? AND n.dedupe_key=? AND r.text_hash<>?',
            [source.code, item.key, hashText(`${item.title}\n${item.body}`)],
          );
          await q.query(
            'DELETE r FROM t_news_rule r JOIN t_news_item n ON n.id=r.news_id WHERE n.source=? AND n.dedupe_key=? AND r.text_hash<>?',
            [source.code, item.key, hashText(`${item.title}\n${item.body}`)],
          );
          const result = await q.query(
            `INSERT INTO t_news_item(source,dedupe_key,kind,title,body,original_url,important,published_at,time_basis,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE title=VALUES(title),body=VALUES(body),original_url=VALUES(original_url),important=GREATEST(important,VALUES(important)),published_at=IF(time_basis='collected' AND VALUES(time_basis)='published',VALUES(published_at),published_at),time_basis=IF(VALUES(time_basis)='published','published',time_basis),updated_at=UTC_TIMESTAMP(3)`,
            [
              source.code,
              item.key,
              item.kind,
              item.title,
              item.body,
              item.url,
              important.has(item.key) ? 1 : 0,
              sqlDate(item.date),
              item.timeBasis,
            ],
          );
          if (item.sourceHash) {
            // Clear an old translation if its English text changed. Missing translation
            // on an unchanged item keeps the last good result through runner outages.
            await q.query(
              'DELETE t FROM t_news_translation t JOIN t_news_item n ON n.id=t.news_id WHERE n.source=? AND n.dedupe_key=? AND t.source_hash<>?',
              [source.code, item.key, item.sourceHash],
            );
          }
          if (item.translation?.title) {
            await q.query(
              `INSERT INTO t_news_translation(news_id,source_hash,title,body,engine,model,updated_at) SELECT id,?,?,?,?,?,UTC_TIMESTAMP(3) FROM t_news_item WHERE source=? AND dedupe_key=? ON DUPLICATE KEY UPDATE source_hash=VALUES(source_hash),title=VALUES(title),body=VALUES(body),engine=VALUES(engine),model=VALUES(model),updated_at=UTC_TIMESTAMP(3)`,
              [
                item.translation.sourceHash,
                item.translation.title,
                item.translation.body,
                item.translation.engine,
                item.translation.model,
                source.code,
                item.key,
              ],
            );
          }
          if (item.sourceHash) await q.commitTransaction();
          if (result.affectedRows === 1) added += 1;
        } catch (error) {
          if (item.sourceHash && q.isTransactionActive)
            await q.rollbackTransaction();
          throw error;
        }
      }
      await q.query(
        `UPDATE t_news_source SET status='ok',last_success=UTC_TIMESTAMP(3),last_error='',last_added=?,consecutive_failures=0,next_attempt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL interval_seconds SECOND) WHERE source=?`,
        [added, source.code],
      );
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      const message = status
        ? `上游返回 HTTP ${status}，保留已采集资讯`
        : '来源暂不可用，保留已采集资讯并自动重试';
      const seconds = Math.min(
        3600,
        Math.max(Number(row.interval_seconds), 120) *
          2 ** Math.min(Number(row.consecutive_failures || 0) + 1, 5),
      );
      await q.query(
        `UPDATE t_news_source SET status='error',last_error=?,consecutive_failures=consecutive_failures+1,next_attempt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND) WHERE source=?`,
        [message, seconds, source.code],
      );
      this.logger.warn(`${source.name}采集失败，已安排重试`);
    }
  }

  async sync(force = false) {
    if (this.busy) return false;
    this.busy = true;
    const lock = this.db.createQueryRunner();
    let acquired = false;
    try {
      await lock.connect();
      const [result] = await lock.query(
        "SELECT GET_LOCK('stock:news-sync',0) acquired",
      );
      acquired = Number(result.acquired) === 1;
      if (!acquired) return false;
      const rows = await lock.query(
        `SELECT * FROM t_news_source WHERE enabled=1 AND (last_attempt IS NULL OR last_attempt<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 SECOND)) ${
          force
            ? ''
            : 'AND (next_attempt IS NULL OR next_attempt<=UTC_TIMESTAMP(3))'
        }`,
      );
      // Separate runners for concurrent workers. The named lock remains on its own connection.
      const queue = rows.filter((row: any) =>
        isNewsSource(sourceByCode(row.source)),
      );
      const workers = await Promise.allSettled(
        [0, 1].map(async () => {
          const worker = this.db.createQueryRunner();
          try {
            await worker.connect();
            while (queue.length) {
              const row = queue.shift();
              await this.collect(sourceByCode(row.source)!, row, worker);
            }
          } finally {
            await worker.release();
          }
        }),
      );
      if (workers.some((worker) => worker.status === 'rejected'))
        throw new Error('News database worker failed');
      // Backfill existing articles incrementally, then enrich newly collected/changed items.
      await this.features.indexBatch();
      await lock.query(
        'DELETE FROM t_news_item WHERE id IN (SELECT id FROM (SELECT n.id FROM t_news_item n LEFT JOIN t_news_favorite f ON f.news_id=n.id WHERE n.published_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 DAY) AND f.news_id IS NULL LIMIT 1000) expired)',
      );
      return true;
    } finally {
      try {
        if (acquired)
          await lock.query("SELECT RELEASE_LOCK('stock:news-sync')");
      } finally {
        await lock.release();
        this.busy = false;
      }
    }
  }
}
