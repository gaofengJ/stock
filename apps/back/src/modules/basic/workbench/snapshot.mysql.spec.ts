import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { BasicSnapshotService } from './snapshot.service';

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;
mysqlDescribe('stock risk projections on MySQL', () => {
  let server: DataSource;
  let db: DataSource;
  let owned = false;
  const database = `stock_risk_projection_test_${process.pid}`;
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
    db = await new DataSource({ ...options, database }).initialize();
    await db.query(
      'CREATE TABLE t_source_basic_snapshot (snapshot_key VARCHAR(64) PRIMARY KEY, data JSON, fetched_at DATETIME, retry_at DATETIME, error VARCHAR(256))',
    );
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (owned) await server.query(`DROP DATABASE ${database}`);
    if (server?.isInitialized) await server.destroy();
  });
  it('reads every matching risk event, single events and no match without SQL keyword errors', async () => {
    const service = new BasicSnapshotService(db, {} as any, {} as any);
    const key = (service as any).key('st', {}, undefined);
    const events = [
      { ts_code: '000010.SZ', ann_date: '20260901' },
      { ts_code: '000010.SZ', ann_date: '20260930' },
      { ts_code: '600825.SH', ann_date: '20261016' },
    ];
    await db.query(
      'INSERT INTO t_source_basic_snapshot VALUES (?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR), NULL)',
      [key, JSON.stringify(events)],
    );
    const multiple = await service.read(
      'st',
      {},
      undefined,
      ['000010.SZ'],
      true,
    );
    expect(multiple.rows).toEqual(events.slice(0, 2));
    expect(
      (await service.read('st', {}, undefined, ['600825.SH'], true)).rows,
    ).toEqual([events[2]]);
    expect(
      (await service.read('st', {}, undefined, ['000001.SZ'], true)).rows,
    ).toEqual([]);
    expect(multiple.state).toBe('ready');
  });
});
