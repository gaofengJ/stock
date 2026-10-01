import 'reflect-metadata';
import { createConnection, Connection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { StockIdentity1791244800000 } from '@/migrations/1791244800000-StockIdentity';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { SyncDayPolicyEntity } from '@/modules/daily-task/sync-day-policy.entity';
import { TushareService } from '@/shared/tushare/tushare.service';
import { DailyEntity } from '../daily/daily.entity';
import { StockHistoryEntity } from './stock-history.entity';
import { StockIdentityService } from './stock-identity.service';

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;

mysqlDescribe('股票历史元数据 MySQL 迁移与就绪校验', () => {
  let admin: Connection;
  let db: DataSource;
  const database = `stock_identity_test_${process.pid}_${Date.now()}`;
  const dates = ['2026-09-28', '2026-09-29', '2026-09-30'];
  beforeAll(async () => {
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.SYNC_TEST_MYSQL_PORT),
      user: 'root',
      password: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
    };
    admin = await createConnection(connection);
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    db = new DataSource({
      type: 'mysql',
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      timezone: 'Z',
      synchronize: true,
      entities: [
        StockHistoryEntity,
        DailyEntity,
        BseMappingEntity,
        SyncRunEntity,
        SyncDayPolicyEntity,
      ],
    });
    await db.initialize();
    await db.query('DROP TABLE t_source_stock_history');
    const runner = db.createQueryRunner();
    try {
      await new StockIdentity1791244800000().up(runner);
    } finally {
      await runner.release();
    }
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP DATABASE \`${database}\``);
      await admin.end();
    }
  });

  it('新增表只存身份元数据；JSON及DATE通过实体正确往返', async () => {
    await db.manager.upsert(
      StockHistoryEntity,
      {
        snapshotKey: 'identity',
        asOf: '2026-10-02',
        data: {
          stocks: [
            {
              tsCode: '000001.SZ',
              name: 'ST当前',
              listDate: '1991-01-01',
              delistDate: null,
            },
          ],
          names: [
            {
              tsCode: '000001.SZ',
              name: '历史正常名称',
              startDate: '1991-01-01',
              endDate: '2026-09-30',
            },
          ],
        },
      },
      ['snapshotKey'],
    );
    const service = new StockIdentityService(db, {} as TushareService);
    const identity = await service.load(dates);
    expect(identity.name('000001.SZ', '2026-09-30')).toBe('历史正常名称');
    expect(await db.manager.count(StockHistoryEntity)).toBe(1);
  });

  it('SQL日期及计数核对正确，缺失PE保留NULL；删除一行后拒绝筛选', async () => {
    await db.manager.insert(
      DailyEntity,
      dates.map((tradeDate) => ({
        tsCode: '000001.SZ',
        tradeDate,
        name: '历史正常名称',
        open: '10',
        high: '11',
        low: '9',
        close: '11',
        preClose: '10',
        change: '1',
        pctChg: '10',
        vol: '100',
        amount: '60000',
        upLimit: '11',
        downLimit: '9',
        peTtm: null,
        volumeRatio: null,
        turnoverRateF: null,
      })),
    );
    await db.manager.insert(
      SyncRunEntity,
      dates.map((tradeDate) => ({
        task: 'daily',
        tradeDate,
        status: 'success' as const,
        dailyCount: 1,
      })),
    );
    const service = new StockIdentityService(db, {} as TushareService);
    await expect(service.assertReady(dates)).resolves.toBeUndefined();
    expect(
      (await db.manager.findOneByOrFail(DailyEntity, { tradeDate: dates[0] }))
        .peTtm,
    ).toBeNull();
    await db.manager.delete(DailyEntity, { tradeDate: dates[0] });
    await expect(service.assertReady(dates)).rejects.toThrow(dates[0]);
  });
});
