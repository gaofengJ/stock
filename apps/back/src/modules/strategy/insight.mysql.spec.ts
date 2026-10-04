import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { MarketInsights1791590400000 } from '../../migrations/1791590400000-MarketInsights';
import { StockInsightEntity, ThsHotEntity } from './insight.entity';
import { InsightService } from './insight.service';

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;
mysqlDescribe('Insight migration and MySQL JSON projections', () => {
  let server: DataSource;
  let db: DataSource;
  let owned = false;
  const database = `stock_insights_test_${process.pid}`;
  beforeAll(async () => {
    const options = {
      type: 'mysql' as const,
      host: '127.0.0.1',
      port: Number(process.env.SYNC_TEST_MYSQL_PORT),
      username: 'root',
      password: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
      timezone: 'Z',
    };
    server = await new DataSource(options).initialize();
    const exists = await server.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',
      [database],
    );
    if (exists.length) throw new Error('Refusing existing test database');
    await server.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4`);
    owned = true;
    db = await new DataSource({
      ...options,
      database,
      entities: [StockInsightEntity, ThsHotEntity],
      synchronize: false,
    }).initialize();
    const runner = db.createQueryRunner();
    try {
      await new MarketInsights1791590400000().up(runner);
    } finally {
      await runner.release();
    }
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (owned) await server.query(`DROP DATABASE ${database}`);
    if (server?.isInitialized) await server.destroy();
  });
  it('round-trips null conversion values without losing code/price alignment', async () => {
    const service = new InsightService(
      db,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service as any, 'revisions').mockResolvedValue([]);
    const date = '2026-09-30';
    const data = ['000001.SZ', '920001.BJ', '600000.SH'].map((code, i) => ({
      code,
      name: code,
      close: i + 100,
      basis: code,
      conversion: i === 1 ? 2 : null,
      traded: true,
      periods: {},
    }));
    await db.manager.save(StockInsightEntity, {
      tradeDate: date,
      revision: (service as any).revision(date, []),
      summary: {},
      signals: { version: 'v1', ready: [], parameters: {}, items: [] },
      data,
    });
    const result = await (service as any).observations([date]);
    expect(result.get(date).data).toEqual(data);
    const first = await db.manager.findOneByOrFail(StockInsightEntity, {
      tradeDate: date,
    });
    await db.manager.save(StockInsightEntity, { ...first, revision: 'old' });
    expect((await (service as any).observations([date])).size).toBe(0);
  });
});
