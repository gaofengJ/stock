import { createHash } from 'crypto';
import axios from 'axios';
import {
  CalendarUnpublishedError,
  decodeInvestmentCalendar,
  investmentRows,
  publicInvestmentCalendar,
  unpublishedCalendar,
} from './investment-calendar';
import { compactUnlockRows } from './unlock-calendar';
import { BasicSnapshotService } from './snapshot.service';
import { WorkbenchService, groupUnlockEvents } from './workbench.service';

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 15);
  });
const snapshotKey = createHash('sha256')
  .update(
    JSON.stringify([
      'share_float',
      { start_date: '20261008', end_date: '20261008' },
      '',
    ]),
  )
  .digest('hex');
const rows = [
  {
    ts_code: '000001.SZ',
    float_date: '20261008',
    holder_name: '甲',
    share_type: '限售股',
    ann_date: '20260901',
    float_share: 10000,
  },
  {
    ts_code: '000001.SZ',
    float_date: '20261008',
    holder_name: '甲',
    share_type: '限售股',
    ann_date: '20260902',
    float_share: 20000,
  },
  {
    ts_code: '000001.SZ',
    float_date: '20261008',
    holder_name: '乙',
    share_type: '限售股',
    ann_date: '20260902',
    float_share: null,
  },
];
const requests: [string, Record<string, unknown>][] = [
  ['share_float', { start_date: '20261008', end_date: '20261008' }],
];

it('decodes GB2312 bytes and UTF-8 without losing Chinese text, and rejects corrupted text', async () => {
  const title = Buffer.from('bfc6bcbcd5b9bbe1', 'hex');
  const bytes = Buffer.concat([
    Buffer.from(
      'calendar({"stat":"ok","data":[{"date":"2026-10-08","events":[["',
    ),
    title,
    Buffer.from('"]]}]});'),
  ]);
  expect(
    decodeInvestmentCalendar(title, 'application/json; charset=gb2312'),
  ).toBe('科技展会');
  expect(decodeInvestmentCalendar(title)).toBe('科技展会');
  expect(
    decodeInvestmentCalendar(
      Buffer.from('科技展会'),
      'text/javascript; charset="utf-8"',
    ),
  ).toBe('科技展会');
  expect(() => decodeInvestmentCalendar(title, 'charset=utf-8')).toThrow();
  expect(() =>
    decodeInvestmentCalendar(Buffer.from('乱码�'), 'charset=utf-8'),
  ).toThrow();
  expect(() =>
    investmentRows(
      'calendar({"stat":"ok","data":[{"date":"2026-10-08","events":[["乱码�"]]}]})',
    ),
  ).toThrow();
  const get = jest.spyOn(axios, 'get').mockResolvedValue({
    data: bytes,
    headers: { 'content-type': 'application/json; charset=gb2312' },
  });
  try {
    const result = await publicInvestmentCalendar({ month: '202610' });
    expect(result.data.items[0][1]).toBe('科技展会');
    expect(get.mock.calls[0][1]?.responseType).toBe('arraybuffer');
  } finally {
    get.mockRestore();
  }
});

it('distinguishes unpublished months from empty published schedules and actual failures', async () => {
  const body = 'calendar({"stat":"err","msg":"数据不存在或还未生成"});';
  expect(() => investmentRows(body)).toThrow(CalendarUnpublishedError);
  expect(investmentRows('calendar({"stat":"ok","data":[]});')).toEqual([]);
  expect(() =>
    investmentRows('calendar({"stat":"err","msg":"服务器异常"});'),
  ).not.toThrow(CalendarUnpublishedError);
  let saved: any = null;
  const get = jest.spyOn(axios, 'get').mockResolvedValue({
    data: Buffer.from(body),
    headers: { 'content-type': 'charset=utf-8' },
  });
  const cache = new BasicSnapshotService(
    {
      manager: {
        findOneBy: async () => saved,
        find: async () => (saved ? [saved] : []),
      },
    } as any,
    {} as any,
    {
      withLock: (callback: any) =>
        callback({
          upsert: async (_: any, record: any) => {
            saved = record;
          },
        }),
    } as any,
  );
  try {
    await cache.read('investment_calendar', { month: '202611' });
    await tick();
    expect(saved.error).toBe(unpublishedCalendar);
    const result = (
      await cache.readCalendarBatch([
        ['investment_calendar', { month: '202611' }],
      ])
    )[0];
    expect(result).toMatchObject({
      state: 'unpublished',
      period: '2026-11',
      message: '日程尚未发布',
      rows: [],
    });
    expect(get).toHaveBeenCalledTimes(1);
    const legacy = createHash('sha256')
      .update(JSON.stringify(['investment_calendar', { month: '202611' }, '']))
      .digest('hex');
    expect(result.key).not.toBe(legacy);
    expect(result.key).toBe(saved.snapshotKey);
    saved.retryAt = new Date(0);
    get.mockResolvedValue({
      data: Buffer.from('calendar({"stat":"ok","data":[]});'),
      headers: { 'content-type': 'charset=utf-8' },
    });
    (cache as any).nextRequest = 0;
    const refreshing = (
      await cache.readCalendarBatch([
        ['investment_calendar', { month: '202611' }],
      ])
    )[0];
    expect(refreshing).toMatchObject({ state: 'loading', message: null });
    await tick();
    expect(
      (await cache.read('investment_calendar', { month: '202611' })).state,
    ).toBe('ready');
    expect(saved.error).toBeNull();
  } finally {
    get.mockRestore();
  }
});

it('parses public investment JSONP without execution and merges duplicate events/associated sectors', () => {
  const data = [
    {
      date: '2026-10-08',
      import: '0',
      events: [['科技展会'], ['科技展会']],
      concept: [[{ name: '机器人' }], [{ name: '人工智能' }]],
    },
  ];
  expect(
    investmentRows(`calendar(${JSON.stringify({ stat: 'ok', data })})`),
  ).toEqual([
    {
      date: '2026-10-08',
      title: '科技展会',
      importance: null,
      sectors: ['机器人', '人工智能'],
    },
  ]);
  expect(() =>
    investmentRows('calendar({"stat":"ok","data":[]});process.exit()'),
  ).toThrow();
  expect(() => investmentRows('callback({"stat":"ok","data":[]})')).toThrow();
  expect(() =>
    investmentRows('calendar({"stat":"error","data":[]})'),
  ).toThrow();
});

it('preserves revised-holder totals, missing amounts and shares units in the compact projection', () => {
  const compact = compactUnlockRows(rows);
  expect(compact[0]).toMatchObject({
    float_share: 20000,
    calendarCount: 2,
    calendarMissing: 1,
  });
  const event = (r: any) => ({
    ...r,
    source: 'share_float',
    tsCode: r.ts_code,
    eventDate: '2026-10-08',
    announcedAt: r.ann_date,
  });
  expect(groupUnlockEvents(compact.map(event))).toEqual(
    groupUnlockEvents(rows.map(event)),
  );
  expect(rows[0].float_share).toBe(10000);
});

it('accepts economic source fields without a stock code and persists a successful empty future schedule', async () => {
  const upsert = jest
    .fn<Promise<void>, [any, any]>()
    .mockResolvedValue(undefined);
  const queryData = jest.fn(async () => ({
    code: 0,
    data: { fields: ['date', 'event'], items: [] },
  }));
  const cache = new BasicSnapshotService(
    { manager: { findOneBy: async () => null } } as any,
    { queryData } as any,
    { withLock: (callback: any) => callback({ upsert }) } as any,
  );
  expect((await cache.read('eco_cal', { date: '20261008' })).state).toBe(
    'loading',
  );
  await tick();
  expect(queryData).toHaveBeenCalledWith(
    'eco_cal',
    { date: '20261008' },
    undefined,
    100,
    15000,
  );
  expect(upsert.mock.calls[0][1]).toMatchObject({
    source: 'eco_cal',
    rows: [],
    error: null,
  });
});

it('returns pending immediately while a large snapshot is prepared, then persists and reuses its projection', async () => {
  const record = {
    snapshotKey,
    source: 'share_float',
    fetchedAt: new Date('2026-10-06T00:00:00Z'),
    updatedAt: new Date('2026-10-06T00:00:00Z'),
    retryAt: new Date('2099-01-01'),
    error: null,
    rows,
  };
  let release: (r: any) => void = () => undefined;
  const findOneBy = jest.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const upsert = jest
    .fn<Promise<void>, [any, any]>()
    .mockResolvedValue(undefined);
  const db = {
    manager: {
      find: jest.fn(async (_: any, options: any) =>
        options.select ? [record] : [],
      ),
      findOneBy,
    },
  };
  const cache = new BasicSnapshotService(
    db as any,
    {} as any,
    { withLock: (callback: any) => callback({ upsert }) } as any,
  );
  const pending = await cache.readCalendarBatch(requests);
  expect(pending[0].state).toBe('loading');
  expect(pending[0].rows).toEqual([]);
  await tick();
  expect(findOneBy).toHaveBeenCalledTimes(1);
  await cache.readCalendarBatch(requests);
  expect(findOneBy).toHaveBeenCalledTimes(1);
  release(record);
  await tick();
  const ready = await cache.readCalendarBatch(requests);
  expect(ready[0].state).toBe('ready');
  expect(ready[0].rows[0].float_share).toBe(20000);
  expect(upsert.mock.calls[0][1].source).toBe('calendar_cache');
  expect(upsert.mock.calls[0][1].snapshotKey).not.toBe(snapshotKey);
  expect(upsert.mock.calls[0][1].fetchedAt).toEqual(record.fetchedAt);
  expect(findOneBy).toHaveBeenCalledTimes(1);
});

it('uses persisted projections after a restart and keeps old data/time while a new version is preparing', async () => {
  const oldTime = new Date('2026-10-05T00:00:00Z');
  const newTime = new Date('2026-10-06T00:00:00Z');
  let time = oldTime;
  const projected = {
    params: {
      originalKey: snapshotKey,
      version: String(oldTime.getTime()),
    },
    fetchedAt: oldTime,
    rows: compactUnlockRows(rows),
  };
  const cache = new BasicSnapshotService(
    {
      manager: {
        find: async (_: any, options: any) =>
          options.select
            ? [
                {
                  snapshotKey,
                  source: 'share_float',
                  fetchedAt: time,
                  updatedAt: time,
                  retryAt: new Date('2099-01-01'),
                  error: null,
                },
              ]
            : [projected],
        findOneBy: () => new Promise(() => {}),
      },
    } as any,
    {} as any,
    {} as any,
  );
  expect((await cache.readCalendarBatch(requests))[0].state).toBe('ready');
  time = newTime;
  const stale = (await cache.readCalendarBatch(requests))[0];
  expect(stale.state).toBe('loading');
  expect(stale.rows).toEqual(projected.rows);
  expect(stale.fetchedAt).toBe(oldTime.toISOString());
  await tick();
});

it('paginates after filtering event type and reuses the same source window across pages', async () => {
  const readCalendarBatch = jest.fn(async (queries: any[]) =>
    queries.map(([source]) => ({
      source,
      state: 'ready',
      rows:
        source === 'express'
          ? Array.from({ length: 5 }, (_, i) => ({
              ts_code: `00000${i}.SZ`,
              ann_date: '20261006',
              perf_summary: '快报',
            }))
          : [],
    })),
  );
  const builder = {
    where: () => builder,
    orderBy: () => builder,
    getOne: async () => null,
  };
  const service = new WorkbenchService(
    {
      manager: {
        find: async () => [],
        getRepository: () => ({ createQueryBuilder: () => builder }),
      },
    } as any,
    { readCalendarBatch } as any,
    {} as any,
  );
  const first = await service.events({
    date: '2026-10-06',
    days: '7',
    page: '1',
    pageSize: '2',
    eventType: '业绩快报',
  });
  const second = await service.events({
    date: '2026-10-06',
    days: '7',
    page: '2',
    pageSize: '2',
    eventType: '业绩快报',
  });
  expect(first.meta.totalItems).toBe(5);
  expect(second.items).toHaveLength(2);
  expect(first.items[0].tsCode).not.toBe(second.items[0].tsCode);
  expect(readCalendarBatch).toHaveBeenCalledTimes(1);
});

it('loads reusable monthly global sources, bounds dates and does not invent country, importance or future events', async () => {
  const queries: any[] = [];
  const service = new WorkbenchService(
    {} as any,
    {
      readCalendarBatch: async (calendarRequests: any[]) => {
        queries.push(...calendarRequests);
        return [
          {
            source: 'investment_calendar',
            state: 'ready',
            rows: [
              { date: '2026-10-31', title: '科技展会', sectors: ['机器人'] },
              { date: '2026-10-01', title: '已过期会议' },
            ],
          },
          {
            source: 'eco_cal',
            state: 'ready',
            rows: [
              {
                date: '20261102',
                time: '08:30',
                country: '美国',
                event: '非农数据',
                pre_value: '10',
                fore_value: '20',
                value: null,
              },
            ],
          },
        ];
      },
    } as any,
    {} as any,
  );
  const result = await service.marketEvents({ date: '2026-10-30', days: '7' });
  expect(queries).toHaveLength(6);
  expect(queries[0][1]).toEqual({ month: '202610' });
  expect(queries[3][1]).toEqual({ month: '202611' });
  expect(result.items).toHaveLength(2);
  expect(result.items[0]).toMatchObject({
    country: null,
    importance: null,
    category: '科技与展会',
  });
  expect(result.items[1]).toMatchObject({
    country: '美国',
    time: '08:30',
    forecast: '20',
    actual: null,
  });
});
