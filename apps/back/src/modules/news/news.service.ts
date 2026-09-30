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
import { NEWS_SOURCES, NewsSource, sourceByCode } from './news.sources';
import { isoDate, normalizeNews, sqlDate } from './news.normalize';
import { NewsQuery, NewsSourceUpdate } from './news.dto';
import { checkNewsSchema } from './news-schema';

@Injectable()
export class NewsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NewsService.name);

  private busy = false;

  private readonly baseUrl: string;

  private readonly enabled: boolean;

  constructor(
    private readonly db: DataSource,
    config: ConfigService,
  ) {
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

  async sources() {
    const rows = await this.db.query('SELECT * FROM t_news_source');
    return {
      collecting: this.busy,
      sources: NEWS_SOURCES.map((s) => {
        const row = rows.find((r: any) => r.source === s.code);
        return {
          code: s.code,
          name: s.name,
          kind: s.kind,
          enabled: Boolean(row?.enabled),
          intervalSeconds: Number(row?.interval_seconds || 120),
          status: row?.status || 'pending',
          lastAttempt: isoDate(row?.last_attempt || null),
          lastSuccess: isoDate(row?.last_success || null),
          nextAttempt: isoDate(row?.next_attempt || null),
          lastError: row?.last_error || '',
          lastAdded: Number(row?.last_added || 0),
        };
      }),
    };
  }

  async updateSource(code: string, dto: NewsSourceUpdate) {
    if (!sourceByCode(code)) throw new BadRequestException('未知资讯来源');
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
    return this.sources();
  }

  async list(query: NewsQuery, userId?: number) {
    const favorites = query.favorites === 'true';
    if (favorites && !userId)
      throw new UnauthorizedException('请登录后查看收藏');
    if (query.source && !sourceByCode(query.source))
      throw new BadRequestException('未知资讯来源');
    const clauses = ['1=1'];
    const args: any[] = [];
    const date =
      query.date ||
      (favorites
        ? ''
        : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
    if (date) {
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
      clauses.push("(n.title LIKE ? ESCAPE '!' OR n.body LIKE ? ESCAPE '!')");
      const pattern = `%${query.keyword
        .trim()
        .replace(/[!%_]/g, (c) => `!${c}`)}%`;
      args.push(pattern, pattern);
    }
    const join =
      'LEFT JOIN t_news_favorite f ON f.news_id=n.id AND f.user_id=?';
    if (favorites) clauses.push('f.news_id IS NOT NULL');
    const where = clauses.join(' AND ');
    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) total FROM t_news_item n ${join} WHERE ${where}`,
      [userId || 0, ...args],
    );
    const rows = await this.db.query(
      `SELECT n.id,n.source,n.kind,n.title,LEFT(n.body,360) body,n.original_url,n.important,n.published_at,n.time_basis,(f.news_id IS NOT NULL) favorite FROM t_news_item n ${join} WHERE ${where} ORDER BY n.published_at DESC,n.id DESC LIMIT ? OFFSET ?`,
      [userId || 0, ...args, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return {
      items: rows.map((r: any) => this.present(r)),
      total: Number(total),
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
      important: Boolean(row.important),
      publishedAt: isoDate(row.published_at),
      timeBasis: row.time_basis || 'published',
      favorite: Boolean(row.favorite),
    };
  }

  async detail(id: number, userId?: number) {
    const [row] = await this.db.query(
      'SELECT n.*,(f.news_id IS NOT NULL) favorite FROM t_news_item n LEFT JOIN t_news_favorite f ON f.news_id=n.id AND f.user_id=? WHERE n.id=?',
      [userId || 0, id],
    );
    if (!row) throw new NotFoundException('资讯不存在或已过期');
    return this.present(row);
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

  private async collect(source: NewsSource, row: any, q: QueryRunner) {
    await q.query(
      "UPDATE t_news_source SET last_attempt=UTC_TIMESTAMP(3),status='collecting' WHERE source=?",
      [source.code],
    );
    try {
      const items = await this.fetch(source.path);
      // The RSSHub JSON feed does not expose Jin10's important flag. Match its important feed instead.
      const important = new Set<string>();
      if (source.code === 'jin10') {
        try {
          const highlights = await this.fetch('/jin10/important');
          highlights.forEach((raw) => {
            const item = normalizeNews(raw, source);
            if (item) {
              important.add(item.key);
              items.push(raw);
            }
          });
        } catch {
          this.logger.warn('金十重点资讯暂不可用，普通快讯继续采集');
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
        if (result.affectedRows === 1) added += 1;
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
      const queue = rows.filter((row: any) => sourceByCode(row.source));
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
      await lock.query(
        'DELETE FROM t_news_item WHERE id IN (SELECT id FROM (SELECT n.id FROM t_news_item n LEFT JOIN t_news_favorite f ON f.news_id=n.id WHERE n.published_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 90 DAY) AND f.news_id IS NULL LIMIT 1000) expired)',
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
