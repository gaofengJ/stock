import 'reflect-metadata';
import { execFileSync } from 'child_process';
import { resolve as resolvePath } from 'path';
import { createConnection, Connection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { checkSyncSchema, syncIndexes } from '@/shared/database/sync-schema';
import { SyncWriteService } from './sync-write.service';
import { SyncDayPolicyEntity } from './sync-day-policy.entity';
import { SyncSafety1790380800001 } from '../../migrations/1790380800001-SyncSafety';

import { DailyTaskService } from './daily-task.service';
import { SyncSourceService } from './sync-source.service';
import { SyncRunEntity } from './sync-run.entity';
import { DailyEntity } from '../source/daily/daily.entity';
import { LimitEntity } from '../source/limit/limit.entity';
import { StockEntity } from '../source/stock/stock.entity';
import { TradeCalEntity } from '../source/trade-cal/trade-cal.entity';
import { ActiveFundsEntity } from '../source/active-funds/active-funds.entity';
import { SentiEntity } from '../processed/senti/senti.entity';
import { ReliableSync1790380800000 } from '../../migrations/1790380800000-ReliableSync';

// 仅显式开启时连接独立本机测试实例，绝不读取应用 DB_* 配置。
const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;
const entities = [
  DailyEntity,
  LimitEntity,
  StockEntity,
  TradeCalEntity,
  ActiveFundsEntity,
  SentiEntity,
  SyncRunEntity,
  SyncDayPolicyEntity,
];
const daily = (tradeDate: string, close = '11') => ({
  tradeDate,
  tsCode: '000001.SZ',
  name: '股票',
  upLimit: '11',
  downLimit: '9',
  open: '10.5',
  high: '11',
  low: '10',
  close,
  preClose: '10',
  change: '1',
  pctChg: '10',
  vol: '100',
  amount: '1000',
});
const limit = (tradeDate: string) => ({
  tradeDate,
  tsCode: '000001.SZ',
  name: '股票',
  close: '11',
  pctChg: '10',
  limit: 'U',
});
const mood = (tradeDate: string) => ({
  tradeDate,
  a: 1,
  b: 1,
  c: 1,
  d: 1,
  e: 0,
  sentiA: '1',
  sentiB: '100',
  sentiC: '100',
  sentiD: '0',
});
const calendar = [
  { calDate: '2024-06-28', isOpen: 1, preTradeDate: '2024-06-27' },
  { calDate: '2024-06-29', isOpen: 0, preTradeDate: '2024-06-28' },
  { calDate: '2024-06-30', isOpen: 0, preTradeDate: '2024-06-28' },
  { calDate: '2024-07-01', isOpen: 1, preTradeDate: '2024-06-28' },
  { calDate: '2024-07-02', isOpen: 1, preTradeDate: '2024-07-01' },
  { calDate: '2024-07-03', isOpen: 1, preTradeDate: '2024-07-02' },
];

mysqlDescribe('MySQL 同步事务与迁移回归', () => {
  let admin: Connection;
  let db: DataSource;
  let service: DailyTaskService;
  const database = `stock_sync_test_${process.pid}_${Date.now()}`;
  const source = {
    calendar: jest.fn(),
    stocks: jest.fn(),
    activeFunds: jest.fn(),
    daily: jest.fn(),
    limits: jest.fn(),
  };
  const stock = {
    tsCode: '000001.SZ',
    symbol: '000001',
    name: '股票',
    area: '',
    industry: '',
    cnspell: '',
    market: '',
    listDate: '1991-01-01',
  };

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
      charset: 'utf8mb4_general_ci',
      migrations: [ReliableSync1790380800000, SyncSafety1790380800001],
      migrationsTransactionMode: 'none',
    });
    await db.initialize();
    service = new DailyTaskService(
      db,
      source as unknown as SyncSourceService,
      new SyncWriteService(db),
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      // 名称只由进程号和时间戳生成，且始终限制在测试库前缀下。
      if (!/^stock_sync_test_\d+_\d+$/.test(database))
        throw new Error('无效测试库名称');
      await admin.query(`DROP DATABASE \`${database}\``);
      await admin.end();
    }
  });

  beforeEach(async () => {
    // eslint-disable-next-line no-restricted-syntax
    for (const entity of entities) {
      // eslint-disable-next-line no-await-in-loop
      await db.createQueryBuilder().delete().from(entity).execute();
    }
    Object.values(source).forEach((fn) => fn.mockReset());
    source.calendar.mockResolvedValue(calendar);
    source.stocks.mockResolvedValue([stock]);
    source.activeFunds.mockResolvedValue([
      { name: '游资', orgs: '', desc: '' },
    ]);
    source.daily.mockImplementation(async (date: string) => [daily(date)]);
    source.limits.mockImplementation(async (date: string) => [limit(date)]);
    await db.manager.insert(TradeCalEntity, calendar);
    await db.manager.insert(StockEntity, stock);
    await db.manager.insert(DailyEntity, daily('2024-06-28'));
    await db.manager.insert(LimitEntity, limit('2024-06-28'));
    await db.manager.insert(SentiEntity, mood('2024-06-28'));
    delete process.env.SYNC_START_DATE;
    delete process.env.SYNC_MAX_DAYS_PER_RUN;
  });

  it('同日重复导入覆盖旧数据，条数不变，移除已撤销的涨跌停记录', async () => {
    await service.import('2024-07-01');
    source.daily.mockResolvedValue([daily('2024-07-01', '10')]);
    source.limits.mockResolvedValue([]);
    await service.import('2024-07-01');
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toBe(1);
    expect(
      await db.manager.findOneBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toMatchObject({ close: '10.00' });
    expect(
      await db.manager.countBy(LimitEntity, { tradeDate: '2024-07-01' }),
    ).toBe(0);
    expect(
      await db.manager.countBy(SentiEntity, { tradeDate: '2024-07-01' }),
    ).toBe(1);
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-01',
      }),
    ).toMatchObject({
      status: 'success',
      attempts: 2,
      dailyCount: 1,
      limitCount: 0,
      sentiCount: 1,
    });
  });

  it('数据库中途插入失败时，日线、涨跌停、情绪数据全部回滚并记录失败', async () => {
    await service.import('2024-07-01');
    const before = await db.manager.findOneByOrFail(DailyEntity, {
      tradeDate: '2024-07-01',
    });
    source.daily.mockResolvedValue([daily('2024-07-01', '12')]);
    source.limits.mockResolvedValue([{ ...limit('2024-07-01'), tsCode: null }]);
    await expect(service.import('2024-07-01')).rejects.toThrow();
    expect(
      await db.manager.findOneBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toEqual(before);
    expect(
      await db.manager.countBy(LimitEntity, { tradeDate: '2024-07-01' }),
    ).toBe(1);
    expect(
      await db.manager.countBy(SentiEntity, { tradeDate: '2024-07-01' }),
    ).toBe(1);
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-01',
      }),
    ).toMatchObject({ status: 'failed', attempts: 2 });
    source.limits.mockResolvedValue([limit('2024-07-01')]);
    await service.import('2024-07-01');
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-01',
      }),
    ).toMatchObject({ status: 'success', attempts: 3 });
  });

  it('接口失败和空基础快照不删除已有记录，游资失败不阻断行情', async () => {
    source.stocks.mockRejectedValueOnce(new Error('权限不足'));
    await expect(service.import('2024-07-01')).rejects.toThrow('权限不足');
    expect(await db.manager.count(StockEntity)).toBe(1);
    source.stocks.mockResolvedValueOnce([]);
    await expect(service.import('2024-07-01')).rejects.toThrow('快照为空');
    expect(await db.manager.count(StockEntity)).toBe(1);
    await db.manager.insert(ActiveFundsEntity, { name: '旧游资' });
    source.activeFunds.mockRejectedValue(new Error('没有权限'));
    await service.import('2024-07-01');
    expect(
      await db.manager.findOneBy(ActiveFundsEntity, { name: '旧游资' }),
    ).not.toBeNull();
    expect(
      await db.manager.findOneBy(SyncRunEntity, { task: 'active-funds' }),
    ).toMatchObject({ status: 'failed' });
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toBe(1);
  });

  it('前一交易日缺失时状态待计算，补齐后自动重算后一天', async () => {
    await db.manager.delete(DailyEntity, { tradeDate: '2024-06-28' });
    source.daily.mockImplementation(async (date: string) => {
      if (date === '2024-06-28') throw new Error('数据源尚未就绪');
      return [daily(date)];
    });
    await service.import('2024-07-01');
    expect(
      await db.manager.countBy(SentiEntity, { tradeDate: '2024-07-01' }),
    ).toBe(0);
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-01',
      }),
    ).toMatchObject({ status: 'pending' });
    source.daily.mockImplementation(async (date: string) => [daily(date)]);
    await service.import('2024-06-28');
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-01',
      }),
    ).toMatchObject({ status: 'success' });
    expect(
      await db.manager.countBy(SentiEntity, { tradeDate: '2024-07-01' }),
    ).toBe(1);
  });

  it('互斥锁跨服务实例生效，异常后释放连接和锁', async () => {
    let unblock!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    source.daily.mockImplementationOnce(async (date: string) => {
      started();
      await pending;
      return [daily(date)];
    });
    const first = service.import('2024-07-01');
    await entered;
    const second = new DailyTaskService(
      db,
      source as unknown as SyncSourceService,
      new SyncWriteService(db),
    );
    try {
      await expect(second.import('2024-07-01')).rejects.toThrow('正在进行');
    } finally {
      unblock();
      await first;
    }
    await second.import('2024-07-01');
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toBe(1);
  });

  it('启动补同步只处理截止日期内的缺口，按日期顺序且重复运行不重拉完整日期', async () => {
    await service.catchUp(new Date('2024-07-02T12:29:59Z'));
    expect(source.daily.mock.calls.map((call) => call[0])).toEqual([
      '2024-07-01',
    ]);
    await service.catchUp(new Date('2024-07-02T12:30:00Z'));
    expect(source.daily.mock.calls.map((call) => call[0])).toEqual([
      '2024-07-01',
      '2024-07-02',
    ]);
    await service.catchUp(new Date('2024-07-02T12:31:00Z'));
    expect(source.daily).toHaveBeenCalledTimes(2);
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-03' }),
    ).toBe(0);
  });

  it('每次补同步有上限，下次继续，手动批量接口保持日期范围语义', async () => {
    process.env.SYNC_MAX_DAYS_PER_RUN = '1';
    await service.catchUp(new Date('2024-07-03T12:30:00Z'));
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-03',
      }),
    ).toMatchObject({ status: 'success' });
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toBe(0);
    await service.catchUp(new Date('2024-07-03T12:30:00Z'));
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-01',
      }),
    ).toMatchObject({ status: 'success' });
    source.daily.mockClear();
    await service.bulkImport('2024-06-29', '2024-07-01');
    expect(source.daily.mock.calls.map((call) => call[0])).toEqual([
      '2024-07-01',
    ]);
  });

  it('历史日期失败仍更新最新行情，恢复后补齐失败日期与待算情绪', async () => {
    source.daily.mockImplementation(async (date: string) => {
      if (date === '2024-07-01') throw new Error('临时故障');
      return [daily(date)];
    });
    await expect(
      service.catchUp(new Date('2024-07-02T12:30:00Z')),
    ).rejects.toThrow('2024-07-01');
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-01',
      }),
    ).toMatchObject({ status: 'failed' });
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-02',
      }),
    ).toMatchObject({ status: 'pending' });
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-02' }),
    ).toBe(1);
    source.daily.mockImplementation(async (date: string) => [daily(date)]);
    await service.catchUp(new Date('2024-07-02T12:30:00Z'));
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-02',
      }),
    ).toMatchObject({ status: 'success' });
  });

  it('手动删除同步清理状态，下一交易日情绪待重算', async () => {
    await service.bulkImport('2024-07-01', '2024-07-02');
    await service.delete('2024-07-01');
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toBe(0);
    expect(
      await db.manager.countBy(SentiEntity, { tradeDate: '2024-07-02' }),
    ).toBe(0);
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-02',
      }),
    ).toMatchObject({ status: 'pending' });
    await service.import('2024-07-01');
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: '2024-07-02',
      }),
    ).toMatchObject({ status: 'success' });
  });

  it('迁移先备份重复记录再去重，保留最新值，唯一约束生效且可重跑', async () => {
    const runner = db.createQueryRunner();
    try {
      await runner.dropIndex('t_source_daily', 'uq_daily_code_date');
      await runner.dropIndex('t_source_limit', 'uq_limit_code_date_type');
      await runner.dropIndex('t_processed_senti', 'uq_senti_date');
      await runner.dropTable('t_sync_run');
      await db.manager.insert(DailyEntity, daily('2024-06-28', '12'));
      await db.manager.insert(LimitEntity, limit('2024-06-28'));
      await db.manager.insert(SentiEntity, mood('2024-06-28'));
      const migration = new ReliableSync1790380800000();
      await db.runMigrations();
      expect(await db.runMigrations()).toEqual([]);
      await migration.up(runner);
      expect(await db.manager.count(DailyEntity)).toBe(1);
      expect(
        await db.manager.findOneBy(DailyEntity, { tradeDate: '2024-06-28' }),
      ).toMatchObject({ close: '12.00' });
      const [backup] = await runner.query(
        'SELECT COUNT(*) AS count FROM t_source_daily_sync_backup_20260926',
      );
      expect(Number(backup.count)).toBe(1);
      await expect(
        db.manager.insert(DailyEntity, daily('2024-06-28')),
      ).rejects.toThrow();
      await service.import('2024-07-01');
      expect(
        await db.manager.findOneBy(SyncRunEntity, {
          task: 'daily',
          tradeDate: '2024-07-01',
        }),
      ).toMatchObject({ status: 'success' });
    } finally {
      await runner.release();
    }
  });

  it('主动删除不被自动同步或前置依赖抓取恢复，手动导入成功才解锁', async () => {
    await service.bulkImport('2024-07-01', '2024-07-02');
    await service.delete('2024-07-01');
    source.daily.mockClear();
    await expect(
      service.catchUp(new Date('2024-07-02T12:30:00Z')),
    ).rejects.toThrow();
    expect(source.daily.mock.calls.map((call) => call[0])).not.toContain(
      '2024-07-01',
    );
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toBe(0);
    expect(await db.manager.count(SyncDayPolicyEntity)).toBe(1);
    source.daily.mockRejectedValueOnce(new Error('temporary'));
    await expect(service.import('2024-07-01')).rejects.toThrow();
    expect(await db.manager.count(SyncDayPolicyEntity)).toBe(1);
    source.limits.mockResolvedValueOnce([
      { ...limit('2024-07-01'), tsCode: null },
    ]);
    await expect(service.import('2024-07-01')).rejects.toThrow();
    expect(await db.manager.count(SyncDayPolicyEntity)).toBe(1);
    expect(
      await db.manager.countBy(DailyEntity, { tradeDate: '2024-07-01' }),
    ).toBe(0);
    await service.import('2024-07-01');
    expect(await db.manager.count(SyncDayPolicyEntity)).toBe(0);
    expect(
      await db.manager.countBy(SentiEntity, { tradeDate: '2024-07-02' }),
    ).toBe(1);
  });

  it('普通创建按业务键更新并保留 ID，批量最后一项生效，失败全批回滚', async () => {
    const writes = new SyncWriteService(db);
    const old = await db.manager.findOneByOrFail(DailyEntity, {
      tradeDate: '2024-06-28',
    });
    await writes.mutate(DailyEntity, 'save', [
      daily('2024-06-28', '12'),
      daily('2024-06-28', '13'),
    ]);
    expect(
      await db.manager.findOneBy(DailyEntity, { id: old.id }),
    ).toMatchObject({ close: '13.00' });
    expect(await db.manager.count(DailyEntity)).toBe(1);
    await expect(
      writes.mutate(DailyEntity, 'save', [
        daily('2024-06-28', '14'),
        { ...daily('2024-07-01'), tsCode: null },
      ]),
    ).rejects.toThrow();
    await expect(
      writes.mutate(DailyEntity, 'save', [{ name: 'missing key' }]),
    ).rejects.toThrow('业务键');
    expect(
      await db.manager.findOneBy(DailyEntity, { id: old.id }),
    ).toMatchObject({ close: '13.00' });
  });

  it('普通更新冲突返回明确提示，删除与清空保留排除记录', async () => {
    const writes = new SyncWriteService(db);
    await db.manager.insert(DailyEntity, daily('2024-07-01'));
    const old = await db.manager.findOneByOrFail(DailyEntity, {
      tradeDate: '2024-06-28',
    });
    await expect(
      writes.mutate(DailyEntity, 'update', { tradeDate: '2024-07-01' }, old.id),
    ).rejects.toThrow('相同业务键');
    await writes.mutate(DailyEntity, 'delete', undefined, old.id);
    expect(
      await db.manager.countBy(SyncDayPolicyEntity, {
        tradeDate: '2024-06-28',
      }),
    ).toBe(1);
    await service.clear();
    expect(await db.manager.count(SyncDayPolicyEntity)).toBeGreaterThanOrEqual(
      2,
    );
    await service.catchUp(new Date('2024-07-02T12:30:00Z'));
    expect(await db.manager.count(DailyEntity)).toBe(0);
  });

  it('普通行情更新同时重算当日及下一交易日，情绪手动删除保持删除', async () => {
    await service.bulkImport('2024-07-01', '2024-07-02');
    const writes = new SyncWriteService(db);
    await writes.mutate(LimitEntity, 'save', {
      ...limit('2024-07-01'),
      limit: 'Z',
    });
    expect(
      await db.manager.findOneBy(SentiEntity, { tradeDate: '2024-07-01' }),
    ).toMatchObject({ e: 1 });
    await writes.mutate(SentiEntity, 'delete', { tradeDate: '2024-07-01' });
    expect(
      await db.manager.countBy(SentiEntity, { tradeDate: '2024-07-01' }),
    ).toBe(0);
    expect(
      await db.manager.countBy(SyncDayPolicyEntity, {
        tradeDate: '2024-07-01',
      }),
    ).toBe(1);
  });

  it('数据库记录限制每个晚间时段执行一次，临时失败下个时段恢复', async () => {
    source.stocks.mockRejectedValueOnce(new Error('temporary'));
    await expect(
      service.catchUp(new Date('2024-07-01T12:30:00Z'), true),
    ).rejects.toThrow();
    await service.catchUp(new Date('2024-07-01T12:31:00Z'), true);
    expect(source.stocks).toHaveBeenCalledTimes(1);
    await service.catchUp(new Date('2024-07-01T12:45:00Z'), true);
    expect(
      await db.manager.countBy(SentiEntity, { tradeDate: '2024-07-01' }),
    ).toBe(1);
    await service.catchUp(new Date('2024-07-01T14:00:00Z'), true);
    expect(source.stocks).toHaveBeenCalledTimes(2);
    await service.catchUp(new Date('2024-07-01T13:00:00Z'), true);
    expect(source.stocks).toHaveBeenCalledTimes(2);
  });

  it('永久权限错误当晚停止补试，次日晚间允许再检查', async () => {
    source.stocks.mockRejectedValueOnce(new Error('没有权限'));
    await expect(
      service.catchUp(new Date('2024-07-01T12:30:00Z'), true),
    ).rejects.toThrow();
    await service.catchUp(new Date('2024-07-01T12:45:00Z'), true);
    expect(source.stocks).toHaveBeenCalledTimes(1);
    await service.catchUp(new Date('2024-07-02T12:30:00Z'), true);
    expect(source.stocks).toHaveBeenCalledTimes(2);
  });

  it('前置日期发生永久配额错误时立即停止请求和当晚补试', async () => {
    process.env.SYNC_MAX_DAYS_PER_RUN = '1';
    source.daily.mockRejectedValue(new Error('每日配额已用完'));
    await expect(
      service.catchUp(new Date('2024-07-03T12:30:00Z'), true),
    ).rejects.toThrow('permanent:');
    expect(source.daily.mock.calls.map((call) => call[0])).toEqual([
      '2024-07-02',
    ]);
    await service.catchUp(new Date('2024-07-03T12:45:00Z'), true);
    expect(source.daily).toHaveBeenCalledTimes(1);
  });

  it('游资永久错误不阻断行情，但当日后续自动补试不重复请求游资', async () => {
    source.activeFunds.mockRejectedValue(new Error('没有权限'));
    source.daily.mockRejectedValue(new Error('temporary'));
    await expect(
      service.catchUp(new Date('2024-07-01T12:30:00Z'), true),
    ).rejects.toThrow();
    await expect(
      service.catchUp(new Date('2024-07-01T12:45:00Z'), true),
    ).rejects.toThrow();
    expect(source.activeFunds).toHaveBeenCalledTimes(1);
    expect(source.daily).toHaveBeenCalledTimes(2);
  });

  it('普通写接口与抓取任务共用跨实例互斥锁', async () => {
    const writes = new SyncWriteService(db);
    await writes.withLock(async () => {
      await expect(
        new SyncWriteService(db).mutate(StockEntity, 'save', stock),
      ).rejects.toThrow('正在进行');
      await expect(service.import('2024-07-01')).rejects.toThrow('正在进行');
    });
    await writes.mutate(StockEntity, 'save', stock);
    expect(
      await db.manager.findOneBy(SyncRunEntity, { task: 'write' }),
    ).toMatchObject({ attempts: 1 });
  });

  it('普通清空使用日期去重保护所有现有日期，不重新填回原始数据', async () => {
    await service.bulkImport('2024-07-01', '2024-07-02');
    await new SyncWriteService(db).mutate(DailyEntity, 'clear');
    expect(await db.manager.count(DailyEntity)).toBe(0);
    expect(await db.manager.count(SyncDayPolicyEntity)).toBe(3);
    await service.catchUp(new Date('2024-07-02T12:30:00Z'));
    expect(await db.manager.count(DailyEntity)).toBe(0);
  });

  it('结构检查拒绝同名但列定义错误的索引，避免误认为迁移完成', async () => {
    const runner = db.createQueryRunner();
    try {
      await runner.query(
        'ALTER TABLE t_source_daily DROP INDEX uq_daily_code_date, ADD UNIQUE INDEX uq_daily_code_date (ts_code)',
      );
      await expect(checkSyncSchema(db)).rejects.toThrow('uq_daily_code_date');
    } finally {
      await runner.query(
        'ALTER TABLE t_source_daily DROP INDEX uq_daily_code_date, ADD UNIQUE INDEX uq_daily_code_date (ts_code, trade_date)',
      );
      await runner.release();
    }
    await expect(checkSyncSchema(db)).resolves.toBeUndefined();
  });

  it('第二张表建索引中断后可以重跑，已经完成的表不再删除数据', async () => {
    const runner = db.createQueryRunner();
    const migration = new ReliableSync1790380800000();
    try {
      await runner.dropIndex('t_source_daily', 'uq_daily_code_date');
      await runner.dropIndex('t_source_limit', 'uq_limit_code_date_type');
      await db.manager.insert(DailyEntity, daily('2024-06-28', '14'));
      const original = runner.createIndex.bind(runner);
      const fault = jest
        .spyOn(runner, 'createIndex')
        .mockImplementation(async (table, index) => {
          if (table === 't_source_limit')
            throw new Error('simulated interrupted DDL');
          return original(table, index);
        });
      await expect(migration.up(runner)).rejects.toThrow('interrupted DDL');
      expect(await db.manager.count(DailyEntity)).toBe(1);
      fault.mockRestore();
      await migration.up(runner);
      expect(
        await db.manager.findOneBy(DailyEntity, { tradeDate: '2024-06-28' }),
      ).toMatchObject({ close: '14.00' });
      await expect(checkSyncSchema(db)).resolves.toBeUndefined();
    } finally {
      await runner.release();
    }
  });

  it('发布 CLI 只读预检、去重数量核对、实际结构验证及重复迁移均通过', async () => {
    const probe = `${database}_release`;
    if (!/^stock_sync_test_\d+_\d+_release$/.test(probe))
      throw new Error('Invalid test database');
    await admin.query(
      `CREATE DATABASE ${probe} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
    );
    const probeDb = new DataSource({
      type: 'mysql',
      host: '127.0.0.1',
      port: Number(process.env.SYNC_TEST_MYSQL_PORT),
      username: 'root',
      password: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
      entities,
      charset: 'utf8mb4_general_ci',
      timezone: 'Z',
      database: probe,
      synchronize: false,
    });
    const cli = (action: string) =>
      execFileSync(process.execPath, ['ops/release/database.cjs', action], {
        cwd: resolvePath(__dirname, '../../..'),
        encoding: 'utf8',
        timeout: 30000,
        env: {
          ...process.env,
          APP_ENV_FILE: '__isolated_test_no_env__',
          NODE_ENV: 'development',
          DB_HOST: '127.0.0.1',
          DB_PORT: String(process.env.SYNC_TEST_MYSQL_PORT),
          DB_USERNAME: 'root',
          DB_PASSWORD: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
          DB_DATABASE: probe,
        },
      })
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
    try {
      // eslint-disable-next-line no-restricted-syntax
      for (const key of syncIndexes) {
        // eslint-disable-next-line no-await-in-loop
        await admin.query(
          `CREATE TABLE ${probe}.${key.table} LIKE ${database}.${key.table}`,
        );
        // eslint-disable-next-line no-await-in-loop
        await admin.query(
          `ALTER TABLE ${probe}.${key.table} DROP INDEX ${key.name}`,
        );
      }
      await probeDb.initialize();
      await probeDb.manager.insert(DailyEntity, [
        daily('2024-06-28'),
        daily('2024-06-28', '14'),
      ]);
      const before = cli('preflight')[0];
      expect(before.pending).toEqual([
        'ReliableSync1790380800000',
        'SyncSafety1790380800001',
        'Accounts1790467200000',
        'AccountAvatars1790467200001',
        'MarketAnalysis1790553600000',
        'LoginActivity1790640000000',
        'DragonPermission1790812800000',
        'RealTimeNews1790812800001',
        'ExpandedNewsSources1790832000000',
        'NewsDisplayPolicy1790835600000',
        'MarketBreadth1790899200000',
        'ThsSectors1790985600000',
        'NewsTranslations1791072000000',
        'NewsReadingFeatures1791158400000',
        'StockIdentity1791244800000',
        'IntradayCounts1791331200000',
        'StrategyTrend1791417600000',
        'IntradayCountsSource1791504000001',
        'MarketInsights1791590400000',
      ]);
      expect(before.counts.t_source_daily).toEqual({ rows: 2, duplicates: 1 });
      expect(before.requiredFreeBytes).toBe(before.totalBytes * 4 + 1024 ** 3);
      expect(await probeDb.manager.count(DailyEntity)).toBe(2);
      const migrated = cli('migrate');
      expect(migrated[1].counts.t_source_daily).toEqual({
        rows: 1,
        duplicates: 0,
      });
      expect(migrated[1].requiredFreeBytes).toBe(1024 ** 3);
      expect(migrated[1].releaseMode).toBe('application');
      expect(cli('verify')[0]).toMatchObject({
        status: 'verified',
        database: probe,
      });
      expect(cli('migrate')[0].pending).toEqual([]);
      expect(
        await probeDb.query('SHOW COLUMNS FROM t_auth_activity_read'),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Field: 'user_id', Key: 'PRI' }),
          expect.objectContaining({ Field: 'last_read_id', Default: '0' }),
        ]),
      );
      const activityIndex = await probeDb.query<
        { Seq_in_index: number; Column_name: string }[]
      >("SHOW INDEX FROM t_auth_audit WHERE Key_name='ix_audit_action_id'");
      expect(
        activityIndex
          .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
          .map((column) => column.Column_name),
      ).toEqual(['action', 'id']);
    } finally {
      if (probeDb.isInitialized) await probeDb.destroy();
      await admin.query(`DROP DATABASE ${probe}`);
    }
  }, 30000);
});
