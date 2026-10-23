/* eslint-disable no-await-in-loop -- Isolated MySQL fixtures verify atomic collection and retry. */
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Connection, createConnection } from 'mysql2/promise';
import { NewsIndexQueue1792756800000 } from '@/migrations/1792756800000-NewsIndexQueue';
import { NewsService } from './news.service';
import { NEWS_SOURCES } from './news.sources';

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;
mysqlDescribe('durable news indexing on MySQL', () => {
  const database = `stock_news_queue_test_${process.pid}_${Date.now()}`;
  let admin: Connection;
  let db: DataSource;
  beforeAll(async () => {
    const options = {
      host: '127.0.0.1',
      port: Number(process.env.SYNC_TEST_MYSQL_PORT),
      username: process.env.SYNC_TEST_MYSQL_USER || 'root',
      password: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
    };
    admin = await createConnection({
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
    });
    await admin.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4`);
    db = await new DataSource({
      ...options,
      type: 'mysql',
      database,
      timezone: 'Z',
    }).initialize();
    await db.query(
      `CREATE TABLE t_news_item(id INT PRIMARY KEY AUTO_INCREMENT, source VARCHAR(16), dedupe_key CHAR(64), kind VARCHAR(16), title VARCHAR(512), body TEXT, original_url VARCHAR(2048), important TINYINT, published_at DATETIME(3), time_basis VARCHAR(16), created_at DATETIME(3), updated_at DATETIME(3), UNIQUE KEY(source,dedupe_key)) ENGINE=InnoDB`,
    );
    await db.query(
      'CREATE TABLE t_news_rule(news_id INT PRIMARY KEY,group_key CHAR(64),text_hash CHAR(64)) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE t_news_stock(news_id INT,ts_code VARCHAR(16),PRIMARY KEY(news_id,ts_code)) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE t_source_stock(ts_code VARCHAR(16),name VARCHAR(64),fullname VARCHAR(128)) ENGINE=InnoDB',
    );
    await db.query(
      `CREATE TABLE t_news_source(source VARCHAR(16) PRIMARY KEY,status VARCHAR(16),interval_seconds INT DEFAULT 120,last_attempt DATETIME(3),last_success DATETIME(3),last_error VARCHAR(200),last_added INT,consecutive_failures INT DEFAULT 0,next_attempt DATETIME(3)) ENGINE=InnoDB`,
    );
    await db.query("INSERT INTO t_news_source(source) VALUES('sina-flash')");
    const q = db.createQueryRunner();
    try {
      await new NewsIndexQueue1792756800000().up(q);
    } finally {
      await q.release();
    }
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP DATABASE ${database}`);
      await admin.end();
    }
  });

  it('persists new and revised work, acknowledges completion and rolls back failed enqueue', async () => {
    const service = new NewsService(
      db,
      new ConfigService({ NEWS_SYNC_ENABLED: 'false' }),
    );
    let body = '正文第一版';
    jest.spyOn(service as any, 'fetchSource').mockImplementation(async () => ({
      items: [
        {
          id: 'queue-fixture',
          title: '平安银行前三季度净利润同比增长10%',
          content_text: body,
          date_published: new Date().toISOString(),
        },
      ],
    }));
    const runner = db.createQueryRunner();
    await runner.connect();
    const collect = () =>
      (service as any).collect(
        NEWS_SOURCES.find((s) => s.code === 'sina-flash'),
        { interval_seconds: 120 },
        runner,
      );
    const queued = async () =>
      Number(
        (await db.query('SELECT COUNT(*) n FROM t_news_index_queue'))[0].n,
      );
    try {
      await collect();
      expect(await queued()).toBe(1);
      await service.features.indexBatch();
      expect(await queued()).toBe(0);
      await collect();
      expect(await queued()).toBe(0);
      body = '正文修订版';
      await collect();
      expect(await queued()).toBe(1);
      await service.features.indexBatch();
      expect(await queued()).toBe(0);
      const query = runner.query.bind(runner);
      const spy = jest
        .spyOn(runner, 'query')
        .mockImplementation(async (sql: string, args?: any[]) => {
          if (sql.startsWith('INSERT IGNORE INTO t_news_index_queue'))
            throw new Error('queue unavailable');
          return query(sql, args);
        });
      body = '必须回滚的正文';
      await collect();
      spy.mockRestore();
      expect((await db.query('SELECT body FROM t_news_item'))[0].body).toBe(
        '正文修订版',
      );
      expect(await queued()).toBe(0);
      expect(
        Number((await db.query('SELECT COUNT(*) n FROM t_news_rule'))[0].n),
      ).toBe(1);
      await db.query('DELETE FROM t_news_rule');
      await new NewsIndexQueue1792756800000().up(runner);
      expect(await queued()).toBe(1);
    } finally {
      await runner.release();
    }
  });

  it('commits both sources when concurrent collectors insert into the same index gap', async () => {
    const service = new NewsService(
      db,
      new ConfigService({ NEWS_SYNC_ENABLED: 'false' }),
    );
    const sources = ['queue-a', 'queue-b'].map((code) => ({
      ...NEWS_SOURCES.find((source) => source.code === 'yicai-news')!,
      code,
    }));
    await db.query(
      'INSERT INTO t_news_source(source) VALUES(?),(?)',
      sources.map((source) => source.code),
    );
    jest.spyOn(service as any, 'fetchSource').mockResolvedValue({
      items: [
        { id: 'concurrent-item', title: '并发采集测试', content_text: '正文' },
      ],
    });
    let arrived = 0;
    let release: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runners = sources.map(() => db.createQueryRunner());
    try {
      await Promise.all(
        runners.map(async (runner, index) => {
          await runner.connect();
          const query = runner.query.bind(runner);
          jest
            .spyOn(runner, 'query')
            .mockImplementation(async (sql: string, args?: any[]) => {
              if (sql.startsWith('INSERT INTO t_news_item')) {
                arrived += 1;
                if (arrived === 2) release();
                await ready;
              }
              return query(sql, args);
            });
          await (service as any).collect(
            sources[index],
            { interval_seconds: 120 },
            runner,
          );
        }),
      );
      const rows = await db.query(
        "SELECT status,last_added FROM t_news_source WHERE source IN ('queue-a','queue-b')",
      );
      expect(rows).toEqual([
        { status: 'ok', last_added: 1 },
        { status: 'ok', last_added: 1 },
      ]);
      expect(
        Number(
          (
            await db.query(
              "SELECT COUNT(*) n FROM t_news_index_queue q JOIN t_news_item n ON n.id=q.news_id WHERE n.source IN ('queue-a','queue-b')",
            )
          )[0].n,
        ),
      ).toBe(2);
    } finally {
      await Promise.all(runners.map((runner) => runner.release()));
    }
  }, 30000);
});
