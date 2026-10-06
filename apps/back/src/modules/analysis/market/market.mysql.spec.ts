/* eslint-disable no-await-in-loop, no-restricted-syntax -- 独立本机数据库的顺序集成测试。 */
import 'reflect-metadata';
import { createConnection, Connection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { StockEntity } from '@/modules/source/stock/stock.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { ActiveFundsEntity } from '@/modules/source/active-funds/active-funds.entity';
import { SentiEntity } from '@/modules/processed/senti/senti.entity';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { SyncDayPolicyEntity } from '@/modules/daily-task/sync-day-policy.entity';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { SyncSourceService } from '@/modules/daily-task/sync-source.service';
import { DailyTaskService } from '@/modules/daily-task/daily-task.service';
import { TushareService } from '@/shared/tushare/tushare.service';
import { Accounts1790467200000 } from '@/migrations/1790467200000-Accounts';
import { MarketAnalysis1790553600000 } from '@/migrations/1790553600000-MarketAnalysis';
import { AdminJobControls1791676800000 } from '@/migrations/1791676800000-AdminJobControls';
import { MarketBreadth1790899200000 } from '@/migrations/1790899200000-MarketBreadth';
import { ThsSectors1790985600000 } from '@/migrations/1790985600000-ThsSectors';
import { JobsService, validRange } from '@/modules/admin/jobs.service';
import { DataLockService } from '@/modules/admin/data-lock.service';
import { AuthService } from '@/modules/auth/auth.service';
import {
  SectorEntity,
  SectorDailyEntity,
  SectorMembersEntity,
} from './sector.entity';
import { MarketSyncService } from './market-sync.service';
import { MarketService } from './market.service';
import {
  BseMappingEntity,
  IndexDailyEntity,
  MarketDailyEntity,
  MarketBreadthEntity,
} from './market.entity';
import { MarketQueryDto } from './market.dto';

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;
const entities = [
  SectorEntity,
  SectorDailyEntity,
  SectorMembersEntity,
  DailyEntity,
  LimitEntity,
  StockEntity,
  TradeCalEntity,
  ActiveFundsEntity,
  SentiEntity,
  SyncRunEntity,
  SyncDayPolicyEntity,
  BseMappingEntity,
  IndexDailyEntity,
  MarketDailyEntity,
  MarketBreadthEntity,
];
const dates = [
  '2024-02-27',
  '2024-02-28',
  '2024-02-29',
  '2024-03-01',
  '2024-03-04',
  '2024-03-05',
];
const calendar = dates.map((calDate, i) => ({
  calDate,
  isOpen: 1,
  preTradeDate: dates[i - 1] || '2024-02-26',
}));
const stocks = ['000001.SZ', '600000.SH', '830001.BJ'].map((tsCode) => ({
  tsCode,
  symbol: tsCode.slice(0, 6),
  name: '测试股票',
  area: '',
  industry: '',
  cnspell: '',
  market: '',
  listDate: '2020-01-01',
}));
const dailyRows = (tradeDate: string) =>
  stocks.map((s) => ({
    tradeDate,
    tsCode: s.tsCode,
    name: s.name,
    upLimit: '11',
    downLimit: '9',
    open: '10.5',
    high: '11',
    low: '10',
    close: '11',
    preClose: '10',
    change: '1',
    pctChg: '10',
    vol: '100',
    amount: '100000',
  }));
const limitRows = (tradeDate: string) => [
  {
    tradeDate,
    tsCode: '000001.SZ',
    name: '测试股票',
    close: '11',
    pctChg: '10',
    limit: 'U',
    limitTimes: 2,
  },
];

mysqlDescribe('市场分析迁移、发布及持久化续跑', () => {
  let admin: Connection;
  let db: DataSource;
  let writes: SyncWriteService;
  let market: MarketSyncService;
  let daily: DailyTaskService;
  let read: MarketService;
  const database = `stock_market_test_${process.pid}_${Date.now()}`;
  const source = {
    calendar: jest.fn(),
    stocks: jest.fn(),
    daily: jest.fn(),
    limits: jest.fn(),
    activeFunds: jest.fn(),
  };
  const remote = { queryData: jest.fn() };
  const indexReply = (_api: string, params: Record<string, string>) => ({
    code: 0,
    message: 'success',
    data: {
      fields: [
        'ts_code',
        'trade_date',
        'close',
        'open',
        'high',
        'low',
        'pre_close',
        'pct_chg',
        'amount',
        'vol',
      ],
      items: (params.trade_date
        ? [params.trade_date]
        : dates.map((d) => d.replace(/-/g, ''))
      ).map((d) => [
        params.ts_code,
        d,
        3000,
        2900,
        3100,
        2800,
        2900,
        3.45,
        10000,
        100,
      ]),
    },
  });
  beforeAll(async () => {
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.SYNC_TEST_MYSQL_PORT),
      user: 'root',
      password: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
    };
    admin = await createConnection(connection);
    await admin.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
    );
    db = new DataSource({
      type: 'mysql',
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      entities,
      synchronize: true,
      timezone: 'Z',
    });
    await db.initialize();
    const q = db.createQueryRunner();
    try {
      await new Accounts1790467200000().up(q);
      // 真正执行建表路径，不依赖 synchronize 自动建立新增表。
      for (const table of [
        't_source_index_daily',
        't_processed_market_daily',
        't_source_bse_mapping',
      ])
        await q.query(`DROP TABLE ${table}`);
      await new MarketAnalysis1790553600000().up(q);
      await new MarketAnalysis1790553600000().up(q);
      await new MarketBreadth1790899200000().up(q);
      await new MarketBreadth1790899200000().up(q);
      await new ThsSectors1790985600000().up(q);
      await new ThsSectors1790985600000().up(q);
      await new AdminJobControls1791676800000().up(q);
    } finally {
      await q.release();
    }
    writes = new SyncWriteService(db);
    market = new MarketSyncService(
      db,
      remote as unknown as TushareService,
      writes,
    );
    daily = new DailyTaskService(
      db,
      source as unknown as SyncSourceService,
      writes,
      market,
    );
    read = new MarketService(db, remote as unknown as TushareService);
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      if (!/^stock_market_test_\d+_\d+$/.test(database))
        throw new Error('非法测试库名');
      await admin.query(`DROP DATABASE \`${database}\``);
      await admin.end();
    }
  });
  beforeEach(async () => {
    // This isolated test database deliberately resets all fixture rows.
    // Use explicit deleteAll: newer TypeORM rejects accidental empty criteria.
    for (const entity of entities) await db.manager.deleteAll(entity);
    await db.query('DELETE FROM t_admin_job');
    Object.values(source).forEach((fn) => fn.mockReset());
    remote.queryData.mockReset().mockImplementation(indexReply);
    source.calendar.mockResolvedValue(calendar);
    source.stocks.mockResolvedValue(stocks);
    source.daily.mockImplementation(async (d: string) => dailyRows(d));
    source.limits.mockImplementation(async (d: string) => limitRows(d));
    source.activeFunds.mockRejectedValue(new Error('独立资料网络失败'));
    await db.manager.insert(TradeCalEntity, calendar);
    await db.manager.insert(StockEntity, stocks);
    await db.manager.insert(SyncRunEntity, {
      task: 'market-reference',
      tradeDate: new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Shanghai',
      }),
      status: 'success',
    });
    await db.manager.insert(DailyEntity, dailyRows(dates[0]));
    await db.manager.insert(LimitEntity, limitRows(dates[0]));
  });
  it('重复迁移幂等，新权限仅授予内置角色，跨闰年允许两个自然年', async () => {
    const [count] = await db.query(
      "SELECT COUNT(*) n FROM t_role_permission rp JOIN t_permission p ON rp.permission_id=p.id WHERE p.code='analysis:overview'",
    );
    expect(Number(count.n)).toBe(2);
    expect(() => validRange('2024-02-29', '2026-02-28')).not.toThrow();
    expect(() => validRange('2024-02-28', '2026-03-01')).toThrow();
  });
  it('最新日优先，每批最多3日，复用完整原始数据且六范围金额可以对账', async () => {
    const first = await daily.marketBatch(dates[1], dates[5]);
    expect(first?.completed).toEqual([dates[5], dates[1], dates[2]]);
    expect(first?.remaining).toBe(2);
    expect(source.daily.mock.calls.map((c) => c[0])).toEqual([
      dates[4],
      dates[5],
      dates[1],
      dates[2],
    ]);
    const latest = await read.series(
      Object.assign(new MarketQueryDto(), { date: dates[5] }),
    );
    expect(latest.snapshot?.amount).toBe(3);
    expect([...latest.markets].reduce((sum, m) => sum + m.amount, 0)).toBe(3);
    expect(latest.indexes).toHaveLength(8);
    await daily.marketBatch(dates[1], dates[5]);
    const calls = source.daily.mock.calls.length;
    expect((await daily.marketBatch(dates[1], dates[5]))?.completed).toEqual(
      [],
    );
    expect(source.daily).toHaveBeenCalledTimes(calls);
    expect({
      dates: (await read.status()).dates,
      runs: await db.query(
        "SELECT task,trade_date,status,error FROM t_sync_run WHERE status<>'success'",
      ),
    }).toEqual({
      dates: [dates[5], dates[4], dates[3], dates[2], dates[1]],
      runs: expect.anything(),
    });
  });
  it('指数部分失败不发布，重试只拉未完成指数，不重新下载原始行情', async () => {
    remote.queryData.mockImplementation((api, params) => {
      if (params.ts_code === '399006.SZ') throw new Error('ECONNRESET');
      return indexReply(api, params);
    });
    expect(
      (await daily.marketBatch(dates[5], dates[5]))?.failures,
    ).toHaveLength(1);
    expect((await read.status()).latestDate).toBeNull();
    expect(
      await db.manager.countBy(IndexDailyEntity, { tradeDate: dates[5] }),
    ).toBe(2);
    const count = source.daily.mock.calls.length;
    remote.queryData.mockClear().mockImplementation(indexReply);
    await daily.marketBatch(dates[5], dates[5]);
    expect(source.daily).toHaveBeenCalledTimes(count);
    expect(remote.queryData).toHaveBeenCalledTimes(6);
    expect((await read.status()).latestDate).toBe(dates[5]);
  });
  it('已确认无事件日记录成功；权限失败当天不反复请求', async () => {
    source.limits.mockResolvedValue([]);
    await daily.marketBatch(dates[5], dates[5]);
    expect(
      (
        await read.series(
          Object.assign(new MarketQueryDto(), { date: dates[5] }),
        )
      ).snapshot?.limitUp,
    ).toBe(0);
    const count = source.daily.mock.calls.length;
    await daily.marketBatch(dates[5], dates[5]);
    expect(source.daily).toHaveBeenCalledTimes(count);
    await db.manager.delete(IndexDailyEntity, { tradeDate: dates[5] });
    await market.invalidate(db.manager, dates[5]);
    remote.queryData.mockRejectedValue(new Error('积分不足，无权限'));
    await daily.marketBatch(dates[5], dates[5]);
    const requests = remote.queryData.mock.calls.length;
    await daily.marketBatch(dates[5], dates[5]);
    expect(remote.queryData).toHaveBeenCalledTimes(requests);
  });
  it('主动删除保护单列，修订使本日和下一交易日不可用', async () => {
    await daily.marketBatch(dates[1], dates[5]);
    await daily.marketBatch(dates[1], dates[5]);
    await market.invalidate(db.manager, dates[4]);
    expect((await read.status()).dates).not.toContain(dates[4]);
    expect((await read.status()).dates).not.toContain(dates[5]);
    await db.manager.insert(SyncDayPolicyEntity, {
      tradeDate: dates[1],
      reason: 'manual-delete',
    });
    expect(
      (await daily.marketBatch(dates[1], dates[5]))?.protectedDates,
    ).toEqual([dates[1]]);
  });
  it('后台任务重启后持续分批，释放锁，并且完成的补数任务可修复新缺口', async () => {
    const auth = { audit: jest.fn() } as unknown as AuthService;
    const locks = new DataLockService(db);
    const jobs = new JobsService(db, daily, auth, locks);
    await db.manager.delete(TradeCalEntity, { calDate: dates[0] });
    await market.enqueueBackfill(db.manager, dates[5]);
    await jobs.tick();
    let [job] = await db.query('SELECT * FROM t_admin_job');
    expect(job.status).toBe('queued');
    expect(await writes.withLock(async () => 'free')).toBe('free');
    await db.query("UPDATE t_admin_job SET status='running'");
    const restarted = new JobsService(db, daily, auth, locks);
    await restarted.onApplicationBootstrap();
    await restarted.tick();
    [job] = await db.query('SELECT * FROM t_admin_job');
    expect({ status: job.status, error: job.error }).toEqual({
      status: 'success',
      error: null,
    });
    await market.invalidate(db.manager, dates[4]);
    await market.enqueueBackfill(db.manager, dates[5]);
    expect((await db.query('SELECT id FROM t_admin_job')).length).toBe(2);
  });
  it('管理员清空同时删除市场派生数据并保留主动排除记录', async () => {
    await daily.marketBatch(dates[1], dates[5]);
    expect(await db.manager.count(MarketDailyEntity)).toBeGreaterThan(0);
    expect(await db.manager.count(IndexDailyEntity)).toBeGreaterThan(0);
    await daily.clear();
    for (const entity of [
      MarketDailyEntity,
      IndexDailyEntity,
      BseMappingEntity,
      DailyEntity,
    ]) {
      expect(await db.manager.count(entity)).toBe(0);
    }
    expect(await db.manager.count(SyncDayPolicyEntity)).toBeGreaterThan(0);
  });
  it('22点核对遇到写锁也会持久化，释放后优先于历史任务执行', async () => {
    await market.enqueueBackfill(db.manager, dates[5]);
    const now = new Date('2024-03-05T14:00:00Z');
    await writes.withLock(async () => {
      expect(await daily.catchUp(now, true)).toBe('pending');
    });
    const [queued] = await db.query(
      "SELECT status FROM t_admin_job WHERE actor_name='系统核对'",
    );
    expect(queued.status).toBe('queued');
    const jobs = new JobsService(
      db,
      daily,
      { audit: jest.fn() } as unknown as AuthService,
      new DataLockService(db),
    );
    await jobs.tick();
    const [checked] = await db.query(
      "SELECT status FROM t_admin_job WHERE actor_name='系统核对'",
    );
    expect(checked.status).toBe('success');
    expect((await read.status()).latestDate).toBe(dates[5]);
    expect(await daily.catchUp(now, true)).toBe('skipped');
  });
});
