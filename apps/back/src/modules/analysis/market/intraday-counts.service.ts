import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { DataSource } from 'typeorm';
import { IntradayCountsQueryDto } from './intraday-counts.dto';
import { checkIntradayCountsSchema } from './intraday-counts-schema';
import {
  collectionSlot,
  INTRADAY_INTERVAL_MINUTES,
  INTRADAY_RETENTION_DAYS,
  parseClsCounts,
} from './intraday-counts.utils';

@Injectable()
export class IntradayCountsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IntradayCountsService.name);

  private readonly enabled: boolean;

  private busy = false;

  constructor(
    private readonly db: DataSource,
    config: ConfigService,
  ) {
    this.enabled =
      String(
        config.get('INTRADAY_COUNTS_ENABLED') ??
          process.env.NODE_ENV === 'production',
      ) === 'true' &&
      String(config.get('SCHEDULE_ENABLED') ?? 'true') !== 'false';
  }

  async onApplicationBootstrap() {
    await checkIntradayCountsSchema(this.db);
    // Reads remain available with scheduling disabled. Never block HTTP startup.
    if (this.enabled) setImmediate(() => this.tick());
  }

  @Cron('0 */5 9-15 * * 1-5', { timeZone: 'Asia/Shanghai' })
  async tick() {
    if (!this.enabled) return;
    try {
      await this.collect();
    } catch {
      // Axios errors can contain headers and URLs; expose only a fixed message.
      this.logger.warn('盘中涨跌家数采集失败，保留已有数据，下个采样周期重试');
    }
  }

  async collect(now = new Date()) {
    const slot = collectionSlot(now);
    if (!slot || this.busy) return false;
    this.busy = true;
    const runner = this.db.createQueryRunner();
    let locked = false;
    try {
      await runner.connect();
      const [lock] = await runner.query(
        "SELECT GET_LOCK('stock_cls_counts_v1',0) acquired",
      );
      locked = Number(lock?.acquired) === 1;
      if (!locked) return false;
      const [day] = await runner.query(
        'SELECT is_open FROM t_source_trade_cal WHERE cal_date=? LIMIT 1',
        [slot.date],
      );
      if (!day) throw new Error('交易日历尚未同步');
      if (Number(day.is_open) !== 1) return false;
      const existing = await runner.query(
        'SELECT 1 FROM t_market_intraday_counts WHERE trade_date=? AND sample_time=? LIMIT 1',
        [slot.date, slot.time],
      );
      if (existing.length) return false;
      const response = await axios.get(
        'https://x-quote.cls.cn/v2/quote/a/stock/emotion',
        {
          params: {
            app: 'CailianpressWeb',
            os: 'web',
            sv: '8.4.6',
            sign: '9f8797a1f4de66c2370f7a03990d2737',
          },
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://www.cls.cn/',
          },
          timeout: 10000,
          maxRedirects: 0,
          maxContentLength: 64 * 1024,
          proxy: false,
        },
      );
      const counts = parseClsCounts(response.data);
      // A slow response crossing a slot must not be mislabeled as the earlier snapshot.
      if (Date.now() - now.getTime() >= INTRADAY_INTERVAL_MINUTES * 60000)
        throw new Error('采样响应已跨越周期');
      await runner.startTransaction();
      await runner.query(
        'INSERT IGNORE INTO t_market_intraday_counts(trade_date,sample_time,up_count,down_count,collected_at) VALUES(?,?,?,?,UTC_TIMESTAMP(3))',
        [slot.date, slot.time, counts.up, counts.down],
      );
      const dates = await runner.query(
        "SELECT DISTINCT DATE_FORMAT(trade_date,'%Y-%m-%d') date FROM t_market_intraday_counts ORDER BY date DESC LIMIT ?",
        [INTRADAY_RETENTION_DAYS],
      );
      if (dates.length === INTRADAY_RETENTION_DAYS)
        await runner.query(
          'DELETE FROM t_market_intraday_counts WHERE trade_date<?',
          [dates[dates.length - 1].date],
        );
      await runner.commitTransaction();
      return true;
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      try {
        if (locked)
          await runner.query("SELECT RELEASE_LOCK('stock_cls_counts_v1')");
      } finally {
        try {
          await runner.release();
        } finally {
          this.busy = false;
        }
      }
    }
  }

  async series(query: IntradayCountsQueryDto) {
    const end =
      query.date ||
      new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const dates = await this.db.query(
      "SELECT DISTINCT DATE_FORMAT(trade_date,'%Y-%m-%d') date FROM t_market_intraday_counts WHERE trade_date<=? ORDER BY date DESC LIMIT ?",
      [end, query.days],
    );
    const rows = dates.length
      ? await this.db.query(
          "SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date,TIME_FORMAT(sample_time,'%H:%i') time,up_count,down_count,collected_at FROM t_market_intraday_counts WHERE trade_date>=? AND trade_date<=? ORDER BY trade_date,sample_time",
          [dates[dates.length - 1].date, end],
        )
      : [];
    return {
      source: '财联社',
      scope: 'all',
      intervalMinutes: INTRADAY_INTERVAL_MINUTES,
      retentionDays: INTRADAY_RETENTION_DAYS,
      endDate: end,
      dates: dates.map((row: any) => row.date).reverse(),
      points: rows.map((row: any) => ({
        date: row.date,
        time: row.time,
        up: Number(row.up_count),
        down: Number(row.down_count),
        collectedAt: new Date(row.collected_at).toISOString(),
      })),
    };
  }
}
