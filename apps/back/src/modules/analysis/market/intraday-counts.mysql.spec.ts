/* eslint-disable no-await-in-loop, no-restricted-syntax -- Sequential operations on an isolated disposable MySQL database. */
import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Connection, createConnection } from 'mysql2/promise';
import axios from 'axios';
import { IntradayCounts1791331200000 } from '@/migrations/1791331200000-IntradayCounts';
import { IntradayCountsService } from './intraday-counts.service';
import { IntradayCountsQueryDto } from './intraday-counts.dto';
import { checkIntradayCountsSchema } from './intraday-counts-schema';

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;
mysqlDescribe('盘中涨跌家数持久化、幂等采样与历史清理', () => {
  const database = `stock_intraday_test_${process.pid}_${Date.now()}`;
  let admin: Connection;
  let db: DataSource;
  let service: IntradayCountsService;
  const sample = new Date('2026-09-30T01:35:00Z');
  const options = {
    host: '127.0.0.1',
    port: Number(process.env.SYNC_TEST_MYSQL_PORT),
    username: process.env.SYNC_TEST_MYSQL_USER || 'root',
    password: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
  };

  beforeAll(async () => {
    admin = await createConnection({
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
    });
    const existing = await admin.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',
      [database],
    );
    expect((existing[0] as any[]).length).toBe(0);
    await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4`);
    db = await new DataSource({
      ...options,
      type: 'mysql',
      database,
      timezone: 'Z',
    }).initialize();
    const runner = db.createQueryRunner();
    try {
      const migration = new IntradayCounts1791331200000();
      await migration.up(runner);
      await migration.up(runner);
      await runner.query(
        'CREATE TABLE t_source_trade_cal(cal_date DATE PRIMARY KEY,is_open TINYINT NOT NULL)',
      );
    } finally {
      await runner.release();
    }
    await checkIntradayCountsSchema(db);
    service = new IntradayCountsService(db, {
      get: () => 'false',
    } as unknown as ConfigService);
  }, 30000);

  beforeEach(async () => {
    await db.query('DELETE FROM t_market_intraday_counts');
    await db.query('DELETE FROM t_source_trade_cal');
    await db.query('INSERT INTO t_source_trade_cal VALUES(?,1)', [
      '2026-09-30',
    ]);
    jest.spyOn(Date, 'now').mockReturnValue(sample.getTime());
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        code: 200,
        data: { up_down_dis: { status: true, rise_num: 2567, fall_num: 2824 } },
      },
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP DATABASE ${database}`);
      await admin.end();
    }
  });

  it('同一采样时点只发出一次上游请求且只保留一条记录，读接口不请求上游', async () => {
    expect(await service.collect(sample)).toBe(true);
    expect(await service.collect(sample)).toBe(false);
    const result = await service.series(
      Object.assign(new IntradayCountsQueryDto(), {
        date: '2026-09-30',
        days: 1,
      }),
    );
    expect(result.dates).toEqual(['2026-09-30']);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({
      date: '2026-09-30',
      time: '09:35',
      up: 2567,
      down: 2824,
    });
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it('保留最近30个有记录的交易日，删除更早的日期，按日期限制查询', async () => {
    const previous = new Date('2026-09-29T00:00:00Z');
    const dates: string[] = [];
    while (dates.length < 33) {
      if (previous.getUTCDay() !== 0 && previous.getUTCDay() !== 6)
        dates.push(previous.toISOString().slice(0, 10));
      previous.setUTCDate(previous.getUTCDate() - 1);
    }
    for (const date of dates) {
      await db.query(
        'INSERT INTO t_market_intraday_counts VALUES(?,?,2000,3000,UTC_TIMESTAMP(3))',
        [date, '15:00'],
      );
    }
    expect(await service.collect(sample)).toBe(true);
    const [{ total }] = await db.query(
      'SELECT COUNT(DISTINCT trade_date) total FROM t_market_intraday_counts',
    );
    expect(Number(total)).toBe(30);
    const oldest = await db.query(
      'SELECT 1 FROM t_market_intraday_counts WHERE trade_date=?',
      [dates[29]],
    );
    expect(oldest).toHaveLength(0);
    const history = await service.series(
      Object.assign(new IntradayCountsQueryDto(), { date: dates[0], days: 5 }),
    );
    expect(history.points).toHaveLength(5);
    expect(history.points.at(-1)?.date).toBe(dates[0]);
  });

  it('节假日不保存上一交易日的旧行情', async () => {
    await db.query('UPDATE t_source_trade_cal SET is_open=0');
    expect(await service.collect(sample)).toBe(false);
    expect(axios.get).not.toHaveBeenCalled();
    expect(
      await db.query('SELECT * FROM t_market_intraday_counts'),
    ).toHaveLength(0);
  });

  it('跨实例数据库锁阻止并发重复请求，解锁后可以采集', async () => {
    await admin.query("SELECT GET_LOCK('stock_cls_counts_v1',0)");
    try {
      expect(await service.collect(sample)).toBe(false);
      expect(axios.get).not.toHaveBeenCalled();
    } finally {
      await admin.query("SELECT RELEASE_LOCK('stock_cls_counts_v1')");
    }
    expect(await service.collect(sample)).toBe(true);
  });
});
