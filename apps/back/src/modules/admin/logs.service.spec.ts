/* eslint-disable no-restricted-syntax, no-await-in-loop -- Exercise bounded stream consumption. */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { reverseLogLines } from './log-lines';
import { LogsService } from './logs.service';
import { retryOutcome } from './job-policy';

describe('admin logs and retry policy', () => {
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
