/* eslint-disable @typescript-eslint/no-var-requires, no-await-in-loop, no-restricted-syntax */
import { createConnection, Connection } from 'mysql2/promise';

const {
  refreshHistory,
  startDate,
} = require('../../ops/test-db/history-refresh.cjs');

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;

describe('两个自然年窗口', () => {
  it('闰日按自然年截断', () => {
    expect(startDate('2024-02-29')).toBe('2022-02-28');
    expect(startDate('2026-09-24')).toBe('2024-09-24');
  });
});

mysqlDescribe('两年历史合并（仅独立本机 MySQL）', () => {
  let db: Connection;
  const config = {
    host: '127.0.0.1',
    port: Number(process.env.SYNC_TEST_MYSQL_PORT),
    user: 'root',
    password: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
    source: `history_source_${process.pid}`,
    target: 'stock_test',
    years: 2,
  };
  let ownsTarget = false;
  const common =
    'id INT AUTO_INCREMENT PRIMARY KEY,created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';
  beforeAll(async () => {
    db = await createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
    });
    const [existing]: any = await db.query("SHOW DATABASES LIKE 'stock_test'");
    if (existing.length)
      throw new Error('测试需要独立实例，拒绝覆盖已有 stock_test');
    await db.query('CREATE DATABASE stock_test CHARACTER SET utf8mb4');
    ownsTarget = true;
    await db.query(`CREATE DATABASE ${config.source} CHARACTER SET utf8mb4`);
    const definitions = {
      t_source_trade_cal: 'cal_date DATE,is_open INT,pre_trade_date DATE',
      t_source_stock: 'ts_code VARCHAR(16)',
      t_source_active_funds: 'name VARCHAR(16)',
      t_source_daily:
        'ts_code VARCHAR(16),trade_date DATE,close DECIMAL(10,2),UNIQUE KEY business(ts_code,trade_date)',
      t_source_limit:
        'ts_code VARCHAR(16),trade_date DATE,`limit` CHAR(1),UNIQUE KEY business(ts_code,trade_date,`limit`)',
      t_processed_senti:
        'trade_date DATE,data INT,UNIQUE KEY business(trade_date)',
      t_sync_run:
        'task VARCHAR(32),trade_date DATE,status VARCHAR(16),daily_count INT,limit_count INT,error TEXT,UNIQUE KEY business(task,trade_date)',
      t_processed_market_daily:
        'trade_date DATE,scope VARCHAR(8),data JSON,UNIQUE KEY business(trade_date,scope)',
    };
    for (const schema of [config.source, config.target]) {
      for (const [table, fields] of Object.entries(definitions))
        await db.query(
          `CREATE TABLE ${schema}.${table} (${common},${fields}) ENGINE=InnoDB`,
        );
      await db.query(
        `CREATE TABLE ${schema}.t_sync_day_policy (trade_date DATE PRIMARY KEY,reason VARCHAR(64))`,
      );
    }
  });
  afterAll(async () => {
    if (ownsTarget) {
      await db.query('DROP DATABASE stock_test');
      await db.query(`DROP DATABASE ${config.source}`);
    }
    await db?.end();
  });
  beforeEach(async () => {
    for (const schema of [config.source, config.target]) {
      const [tables]: any = await db.query(`SHOW TABLES FROM ${schema}`);
      for (const table of tables)
        await db.query(`DELETE FROM ${schema}.${Object.values(table)[0]}`);
    }
    await db.query(
      `INSERT INTO ${config.source}.t_source_trade_cal(cal_date,is_open,pre_trade_date) VALUES ('2024-07-01',1,'2024-06-28'),('2024-07-02',1,'2024-07-01'),('2024-07-03',1,'2024-07-02')`,
    );
    await db.query(
      `INSERT INTO ${config.source}.t_source_stock(ts_code) VALUES ('000001.SZ')`,
    );
    for (const date of [
      '2024-06-28',
      '2024-07-01',
      '2024-07-02',
      '2024-07-03',
    ]) {
      await db.query(
        `INSERT INTO ${config.source}.t_source_daily(ts_code,trade_date,close) VALUES ('000001.SZ',?,10)`,
        [date],
      );
      await db.query(
        `INSERT INTO ${config.source}.t_sync_run(task,trade_date,status,daily_count,limit_count) VALUES ('daily',?,'success',1,0)`,
        [date],
      );
    }
  });
  async function finish(state = {}) {
    let result: any = state;
    for (let n = 0; n < 8; n += 1) {
      result = await refreshHistory(config, result);
      if (!result.remaining) return result;
    }
    throw new Error('进度未收敛');
  }
  it('不复制主键，保留区间外数据，重叠日期覆盖且重跑不增加记录', async () => {
    const [source]: any = await db.query(
      `SELECT id FROM ${config.source}.t_source_daily ORDER BY id LIMIT 1`,
    );
    await db.query(
      "INSERT INTO stock_test.t_source_daily(id,ts_code,trade_date,close) VALUES (?,'OTHER.SZ','2020-01-02',8)",
      [source[0].id],
    );
    await db.query(
      "INSERT INTO stock_test.t_source_daily(ts_code,trade_date,close) VALUES ('000001.SZ','2024-07-01',9)",
    );
    const state = await finish();
    const [rows]: any = await db.query(
      'SELECT ts_code,trade_date,close FROM stock_test.t_source_daily',
    );
    expect(rows).toHaveLength(5);
    expect(rows.filter((r: any) => r.ts_code === 'OTHER.SZ')).toHaveLength(1);
    expect(
      rows
        .filter((r: any) => r.ts_code === '000001.SZ')
        .every((r: any) => Number(r.close) === 10),
    ).toBe(true);
    expect((await refreshHistory(config, state)).status).toBe('unchanged');
    await finish({}); // Simulate lost checkpoint after COMMIT.
    const [count]: any = await db.query(
      'SELECT COUNT(*) n FROM stock_test.t_source_daily',
    );
    expect(Number(count[0].n)).toBe(5);
  });
  it('删除保护、未完成源日与无记录空事件日不发布', async () => {
    await db.query(
      "INSERT INTO stock_test.t_sync_day_policy VALUES ('2024-07-01','人工删除')",
    );
    await db.query(
      `UPDATE ${config.source}.t_sync_run SET status='running' WHERE trade_date='2024-07-02'`,
    );
    await db.query(
      `DELETE FROM ${config.source}.t_sync_run WHERE trade_date='2024-07-03'`,
    );
    const state = await finish();
    expect(Object.keys(state.blocked)).toEqual(
      expect.arrayContaining(['2024-07-01', '2024-07-02', '2024-07-03']),
    );
    const [rows]: any = await db.query(
      'SELECT * FROM stock_test.t_source_daily',
    );
    expect(rows).toHaveLength(1);
  });
  it('修订数据重算当日和下一交易日，空事件删除旧键', async () => {
    let state = await finish();
    await db.query(
      "INSERT INTO stock_test.t_source_limit(ts_code,trade_date,`limit`) VALUES ('OLD.SZ','2024-07-01','U')",
    );
    await db.query(
      "INSERT INTO stock_test.t_processed_market_daily(trade_date,scope,data) VALUES ('2024-07-01','all','{}'),('2024-07-02','all','{}')",
    );
    await db.query(
      `UPDATE ${config.source}.t_source_daily SET close=12 WHERE trade_date='2024-07-01'`,
    );
    state = await finish(state);
    expect(state.remaining).toBe(0);
    const [events]: any = await db.query(
      'SELECT * FROM stock_test.t_source_limit',
    );
    const [stats]: any = await db.query(
      'SELECT * FROM stock_test.t_processed_market_daily',
    );
    expect(events).toHaveLength(0);
    expect(stats).toHaveLength(0);
  });
  it('复制失败回滚当日，成功前不留下部分数据，重试可完成', async () => {
    await db.query(
      "CREATE TRIGGER stock_test.reject_copy BEFORE INSERT ON stock_test.t_source_limit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'",
    );
    await db.query(
      `INSERT INTO ${config.source}.t_source_limit(ts_code,trade_date,\`limit\`) VALUES ('000001.SZ','2024-07-03','U')`,
    );
    await db.query(
      `UPDATE ${config.source}.t_sync_run SET limit_count=1 WHERE trade_date='2024-07-03'`,
    );
    await expect(refreshHistory(config)).rejects.toThrow('fixture failure');
    const [rows]: any = await db.query(
      "SELECT * FROM stock_test.t_source_daily WHERE trade_date='2024-07-03'",
    );
    expect(rows).toHaveLength(0);
    await db.query('DROP TRIGGER stock_test.reject_copy');
    expect((await finish()).remaining).toBe(0);
  });
});
