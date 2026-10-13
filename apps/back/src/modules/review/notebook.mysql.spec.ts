/* eslint-disable no-await-in-loop, no-restricted-syntax -- These tests create and remove only their own loopback database. */
import { Connection, createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { ReviewNotebook1792195200000 } from '@/migrations/1792195200000-ReviewNotebook';
import { ReviewGeneration1792281600000 } from '@/migrations/1792281600000-ReviewNotebookGeneration';
import { ReviewAssets1792368000000 } from '@/migrations/1792368000000-ReviewAssets';
import { NotebookService } from './notebook.service';

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const date = '2026-10-12';
const content = JSON.stringify({
  private: { execution: 'private note' },
  public: {},
  article: {
    body: '# Public\n## Market\nFacts',
    feishuUrl: '',
    images: [
      { id: 'one', data: png, caption: 'Chart', source: date, after: 'Market' },
    ],
  },
});
const tables = [
  't_review_publication',
  't_review_notebook_version',
  't_review_notebook',
  't_review_image',
  't_review_notebook_state',
];

mysqlDescribe('notebook assets and publication transactions', () => {
  let admin: Connection;
  let db: DataSource;
  let service: NotebookService;
  const database = `stock_notebook_test_${process.pid}_${Date.now()}`;

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
    });
    await db.initialize();
    await db.query(
      'CREATE TABLE t_user(id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB',
    );
    await db.query('INSERT INTO t_user VALUES(17),(18)');
    const runner = db.createQueryRunner();
    try {
      await new ReviewNotebook1792195200000().up(runner);
      await new ReviewGeneration1792281600000().up(runner);
      await new ReviewAssets1792368000000().up(runner);
      await new ReviewAssets1792368000000().up(runner);
    } finally {
      await runner.release();
    }
    service = new NotebookService(db);
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP DATABASE \`${database}\``);
      await admin.end();
    }
  });
  beforeEach(async () => {
    for (const table of tables) await db.query(`DELETE FROM ${table}`);
  });

  it('deduplicates repeated saves while preserving old and new read contracts', async () => {
    await service.save(17, { date, revision: 0, content });
    await service.save(17, { date, revision: 1, content });
    expect(
      await db.query('SELECT image_hash FROM t_review_image WHERE user_id=17'),
    ).toHaveLength(1);
    const stored = await db.query(
      'SELECT content FROM t_review_notebook_version WHERE user_id=17',
    );
    expect(stored).toHaveLength(2);
    stored.forEach((row: { content: string }) => {
      expect(row.content).not.toContain(png);
      expect(row.content).toContain('review-asset:');
    });
    await service.recordPublication(17, {
      date,
      revision: 2,
      channel: 'wechat',
      url: 'https://mp.weixin.qq.com/s/fixture',
    });
    const legacy = await service.read(17, date);
    expect(legacy.content!.article!.images[0].data).toBe(png);
    expect(legacy.publications[0].body).toContain(png);
    expect(legacy.publications[0].body).not.toContain('private note');
    expect(legacy.publications[0]).not.toHaveProperty('imageRefs');
    const runner = db.createQueryRunner();
    try {
      await expect(
        new ReviewAssets1792368000000().down(runner),
      ).rejects.toThrow('references are in use');
    } finally {
      await runner.release();
    }
    const summary = await service.read(17, date, undefined, false);
    expect(summary.publications[0]).not.toHaveProperty('body');
    expect(
      (await service.publication(17, summary.publications[0].id)).body,
    ).toContain(png);
    await expect(
      service.publication(18, summary.publications[0].id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('continues reading inline legacy images without rewriting old records', async () => {
    await db.query(
      'INSERT INTO t_review_notebook(user_id,trade_date,revision,content) VALUES(17,?,1,?)',
      [date, content],
    );
    expect(
      (await service.read(17, date, undefined, false)).content!.article!
        .images[0].data,
    ).toBe(png);
  });

  it('serializes publication with clearing and rejects the old generation', async () => {
    await service.save(17, { date, revision: 0, content });
    await service.save(18, { date, revision: 0, content });
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(
        'SELECT generation FROM t_review_notebook_state WHERE user_id=17 FOR UPDATE',
      );
      const result = service
        .recordPublication(17, {
          date,
          revision: 1,
          generation: 0,
          channel: 'wechat',
          url: 'https://mp.weixin.qq.com/s/fixture',
        })
        .then(
          () => null,
          (error) => error,
        );
      for (const table of tables.slice(0, -1))
        await runner.query(`DELETE FROM ${table} WHERE user_id=17`);
      await runner.query(
        'UPDATE t_review_notebook_state SET generation=1 WHERE user_id=17',
      );
      await runner.commitTransaction();
      expect(await result).toMatchObject({ status: 409 });
      expect(
        await db.query('SELECT id FROM t_review_publication WHERE user_id=17'),
      ).toEqual([]);
      expect(
        (await service.read(18, date, undefined, false)).content!.article!
          .images[0].data,
      ).toBe(png);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
