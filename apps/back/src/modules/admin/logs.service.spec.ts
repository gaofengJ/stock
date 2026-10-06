/* eslint-disable no-restricted-syntax, no-await-in-loop -- Exercise bounded stream consumption. */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { reverseLogLines } from './log-lines';
import { LogsService, logRange } from './logs.service';
import { retryOutcome } from './job-policy';

describe('admin logs and retry policy', () => {
  it('accepts seven inclusive dates and rejects wider log and audit queries', () => {
    expect(
      logRange({
        page: 1,
        pageSize: 20,
        startDate: '2026-10-01',
        endDate: '2026-10-07',
      }),
    ).toEqual({ start: '2026-10-01', end: '2026-10-07' });
    expect(() =>
      logRange({
        page: 1,
        pageSize: 20,
        startDate: '2026-10-01',
        endDate: '2026-10-08',
      }),
    ).toThrow('单次最多查询7天');
  });
  let directory: string;
  let oldDirectory: string | undefined;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-logs-'));
    oldDirectory = process.env.LOG_DIR;
    process.env.LOG_DIR = directory;
  });
  afterEach(() => {
    if (oldDirectory === undefined) delete process.env.LOG_DIR;
    else process.env.LOG_DIR = oldDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  it('pages newest first across dates and filters and redacts before searching', async () => {
    const entry = (message: string) =>
      JSON.stringify({ level: 'error', message, token: 'sensitive' });
    fs.writeFileSync(
      path.join(directory, 'stock-back.2026-10-02.log'),
      `${entry('early')}\ninvalid\n${entry('latest')}\n`,
    );
    fs.writeFileSync(
      path.join(directory, 'stock-back.2026-10-01.log'),
      entry('yesterday'),
    );
    const logs = new LogsService({} as any);
    const query = {
      page: 1,
      pageSize: 1,
      startDate: '2026-10-01',
      endDate: '2026-10-02',
    };
    const first = await logs.application(query);
    expect(first.items[0].message).toBe('latest');
    expect(first.total).toBe(3);
    expect(first.malformed).toBe(1);
    expect(
      (await logs.application({ ...query, page: 2 })).items[0].message,
    ).toBe('early');
    expect(
      (await logs.application({ ...query, page: 3 })).items[0].message,
    ).toBe('yesterday');
    expect(
      (await logs.application({ ...query, keyword: 'sensitive' })).total,
    ).toBe(0);
    expect(
      (await logs.application({ ...query, keyword: 'early' })).levels.error,
    ).toBe(1);
  });
  it('keeps UTF-8 and bounded oversized records intact when traversing backwards', async () => {
    const file = path.join(directory, 'utf8.log');
    const text = `前${'中文🙂'.repeat(20000)}尾`;
    fs.writeFileSync(file, `old\n${'x'.repeat(1100000)}\n${text}\nlatest`);
    const rows: string[] = [];
    for await (const line of reverseLogLines(file, {
      bytes: 2000000,
      truncated: false,
    }))
      rows.push(line);
    expect(rows).toEqual(['latest', text, '{oversized log line}', 'old']);
    const limited = { bytes: 20, truncated: false };
    const tail: string[] = [];
    for await (const line of reverseLogLines(file, limited)) tail.push(line);
    expect(tail).toEqual(['latest']);
    expect(limited.truncated).toBe(true);
    expect(limited.bytes).toBe(0);
  });
  it('shows errors and warnings without including ordinary request noise', async () => {
    fs.writeFileSync(
      path.join(directory, 'stock-back.2026-10-02.log'),
      ['info', 'warn', 'error', 'debug']
        .map((level) => JSON.stringify({ level, message: level }))
        .join('\n'),
    );
    const service = new LogsService({} as any);
    const query = { page: 1, pageSize: 20, startDate: '2026-10-02' };
    const issues = await service.application({ ...query, view: 'issues' });
    expect(issues.items.map((r) => r.level)).toEqual(['error', 'warn']);
    expect(issues.levels).toEqual({ error: 1, warn: 1 });
    expect(issues.trend).toEqual({ '2026-10-02': 1 });
    expect((await service.application({ ...query, view: 'all' })).total).toBe(
      4,
    );
    expect(
      (await service.application({ ...query, view: 'all', level: 'info' }))
        .total,
    ).toBe(1);
  });
  it('searches audit actors and targets and interprets dates in Beijing', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          {
            id: 9,
            actorName: 'mufeng',
            action: 'sync.submit',
            target: '123',
            result: 'success',
          },
        ]),
    };
    const service = new LogsService(db as any);
    const result = await service.audit({
      page: 1,
      pageSize: 20,
      startDate: '2026-10-02',
      keyword: '123',
    });
    expect(result.total).toBe(1);
    const [sql, args] = db.query.mock.calls[0];
    expect(sql).toContain('actor_name LIKE ?');
    expect(sql).toContain('target LIKE ?');
    expect(args[0].toISOString()).toBe('2026-10-01T16:00:00.000Z');
    expect(args.slice(2)).toEqual(['%123%', '%123%', '%123%', '%123%']);
  });
  it('statistics are independent of file scans and cache by date range', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValue([
          { source: 'scheduled', status: 'success', count: 2 },
        ]),
    };
    const service = new LogsService(db as any);
    const scan = jest
      .spyOn(service, 'application')
      .mockRejectedValue(new Error('unreadable logs'));
    const query = {
      page: 1,
      pageSize: 20,
      startDate: '2026-10-01',
      endDate: '2026-10-01',
    };
    expect((await service.stats(query)).sync[0].source).toBe('scheduled');
    await service.stats({ ...query, page: 2 });
    expect(db.query).toHaveBeenCalledTimes(1);
    await service.stats({ ...query, endDate: '2026-10-02' });
    expect(db.query).toHaveBeenCalledTimes(2);
    await service.stats({ ...query, refresh: '1' });
    expect(db.query).toHaveBeenCalledTimes(3);
    await service.stats(query);
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(scan).not.toHaveBeenCalled();
  });
  it('backs off and stops after five failed batches without limiting healthy batches', () => {
    expect(retryOutcome('pending', 0, 0).nextRetryAt?.getTime()).toBe(
      5 * 60000,
    );
    expect(retryOutcome('pending', 3, 0).nextRetryAt?.getTime()).toBe(
      40 * 60000,
    );
    expect(retryOutcome('pending', 4)).toMatchObject({
      status: 'failed',
      failures: 5,
      nextRetryAt: null,
      exhausted: true,
    });
    expect(retryOutcome('queued', 4)).toMatchObject({
      status: 'queued',
      failures: 4,
      nextRetryAt: null,
    });
    expect(retryOutcome('failed', 0)).toMatchObject({
      status: 'failed',
      nextRetryAt: null,
    });
  });
});
