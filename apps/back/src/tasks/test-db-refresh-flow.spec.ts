/* eslint-disable @typescript-eslint/no-var-requires, no-nested-ternary, camelcase, global-require */
export {};
const { refresh, TABLES } = require('../../ops/test-db/refresh.cjs');

const dates = ['2024-07-01', '2024-07-02', '2024-07-03'];
function setup(
  options: {
    state?: string;
    noStateTable?: boolean;
    noLimits?: boolean;
    changed?: boolean;
    revisionChanged?: boolean;
    deletedDate?: string;
    busy?: boolean;
    failRename?: boolean;
  } = {},
) {
  const sourceQueries: string[] = [];
  const targetQueries: string[] = [];
  const inserts: Record<string, any[]> = {};
  const columns = (name: string) =>
    name === 't_source_limit'
      ? ['id', 'trade_date', 'ts_code', 'limit']
      : ['t_source_daily', 't_processed_senti'].includes(name)
      ? ['id', 'trade_date', 'ts_code']
      : ['id'];
  let fingerprints = 0;
  const source = {
    end: jest.fn(),
    query: jest.fn(async ({ sql }: { sql: string }, values: any[]) => {
      sourceQueries.push(sql);
      if (sql.startsWith('SELECT MAX(updated_at)'))
        return [
          [
            {
              updated: '2024-07-03',
              count: 1,
              attempts: options.revisionChanged && fingerprints > 1 ? 2 : 1,
            },
          ],
        ];
      if (sql.startsWith('SELECT MAX')) {
        const name = TABLES.find((table: string) =>
          sql.includes(`\`${table}\``),
        );
        if (name === TABLES[0]) fingerprints += 1;
        return [
          [
            {
              id: options.changed && fingerprints > 1 ? 2 : 1,
              ...(sql.includes('date')
                ? {
                    date:
                      options.noLimits && name === 't_source_limit'
                        ? null
                        : dates[2],
                  }
                : {}),
            },
          ],
        ];
      }
      if (
        sql.includes('information_schema.TABLES') &&
        values[1] === 't_sync_day_policy'
      )
        return [
          options.deletedDate ? [{ TABLE_NAME: 't_sync_day_policy' }] : [],
        ];
      if (sql.startsWith('SELECT trade_date FROM'))
        return [[{ trade_date: options.deletedDate }]];
      if (sql.includes('information_schema.TABLES'))
        return [options.noStateTable ? [] : [{ TABLE_NAME: 't_sync_run' }]];
      if (sql.startsWith('SELECT status'))
        return [
          options.state
            ? [{ status: options.state, updated_at: '2024-07-03' }]
            : [],
        ];
      if (sql.startsWith('SELECT cal_date'))
        return [
          dates
            .slice()
            .reverse()
            .map((cal_date) => ({
              cal_date,
              pre_trade_date:
                dates[dates.indexOf(cal_date) - 1] || '2024-06-28',
            })),
        ];
      if (sql.startsWith('SHOW COLUMNS')) {
        const name = TABLES.find((table: string) =>
          sql.includes(`\`${table}\``),
        );
        return [columns(name).map((Field) => ({ Field }))];
      }
      if (sql.includes('id>?')) {
        const name = TABLES.find((table: string) =>
          sql.includes(`\`${table}\``),
        );
        if (
          values.length === 2 &&
          options.deletedDate &&
          (values[0] === options.deletedDate ||
            (name === 't_processed_senti' &&
              dates[dates.indexOf(values[0]) - 1] === options.deletedDate))
        )
          return [[]];
        if (
          values[values.length - 1] ||
          (options.noLimits && name === 't_source_limit')
        )
          return [[]];
        return [
          [
            {
              id: values.length === 2 ? dates.indexOf(values[0]) + 1 : 1,
              trade_date: values[0],
              ts_code: '000001.SZ',
              limit: 'U',
            },
          ],
        ];
      }
      return [[]];
    }),
  };
  const target = {
    end: jest.fn(),
    query: jest.fn(async ({ sql }: { sql: string }, values: any[]) => {
      targetQueries.push(sql);
      if (sql.includes('GET_LOCK'))
        return [[{ acquired: options.busy ? 0 : 1 }]];
      if (sql.startsWith('SHOW COLUMNS')) {
        const name = TABLES.find((table: string) =>
          sql.includes(`\`${table}\``),
        );
        return [columns(name).map((Field) => ({ Field }))];
      }
      if (sql.startsWith('INSERT INTO')) {
        const name = TABLES.find((table: string) =>
          sql.includes(`\`_refresh_${table}\``),
        );
        inserts[name] = [...(inserts[name] || []), ...values[0]];
      }
      if (sql.startsWith('SELECT COUNT')) {
        const name = TABLES.find((table: string) =>
          sql.includes(`\`_refresh_${table}\``),
        );
        return [[{ count: inserts[name]?.length || 0 }]];
      }
      if (sql.startsWith('RENAME') && options.failRename)
        throw new Error('lock wait timeout');
      return [[]];
    }),
  };
  jest
    .spyOn(require('mysql2/promise'), 'createConnection')
    .mockResolvedValueOnce(source)
    .mockResolvedValueOnce(target);
  return { sourceQueries, targetQueries, source, target };
}

describe('测试刷新发布流程', () => {
  const config = { source: 'stock', target: 'stock_test', days: 2 };
  afterEach(() => jest.restoreAllMocks());
  it('迁移后无历史记录仍需两次稳定观测，force 不能跳过', async () => {
    const first = setup();
    const state = await refresh(config, {}, true);
    expect(state.status).toBe('waiting-for-stable-source');
    expect(first.targetQueries.some((q) => q.startsWith('RENAME'))).toBe(false);
    jest.restoreAllMocks();
    setup();
    expect(await refresh(config, state)).toMatchObject({
      status: 'copied',
      readiness: 'legacy-stable',
    });
  });
  it.each(['running', 'pending', 'failed'])(
    '已有 %s 状态不能走旧版兼容或强制刷新',
    async (state) => {
      setup({ state });
      await expect(refresh(config, {}, true)).rejects.toThrow('not successful');
    },
  );
  it('新版本成功记录允许窗口内没有涨跌停，且一次原子发布六表', async () => {
    const mocks = setup({ state: 'success', noLimits: true });
    expect(await refresh(config)).toMatchObject({
      status: 'copied',
      readiness: 'sync-success',
      counts: { t_source_limit: 0 },
    });
    expect(
      mocks.targetQueries.filter((q) => q.startsWith('RENAME')),
    ).toHaveLength(1);
    expect(
      mocks.sourceQueries.some((q) => /^(INSERT|DELETE|UPDATE|DROP)/.test(q)),
    ).toBe(false);
  });
  it('复制期间生产发生变化时保留旧测试表', async () => {
    const mocks = setup({ state: 'success', changed: true });
    await expect(refresh(config)).rejects.toThrow('changed during copy');
    expect(mocks.targetQueries.some((q) => q.startsWith('RENAME'))).toBe(false);
  });
  it('历史行原地修改虽未改变最大 ID，写入版本变化仍阻止发布', async () => {
    const mocks = setup({ state: 'success', revisionChanged: true });
    await expect(refresh(config)).rejects.toThrow('changed during copy');
    expect(mocks.targetQueries.some((q) => q.startsWith('RENAME'))).toBe(false);
  });
  it('窗口内主动删除和其直接情绪依赖不被误判为抓取缺失', async () => {
    setup({ state: 'success', deletedDate: dates[0] });
    expect(await refresh(config)).toMatchObject({
      status: 'copied',
      counts: { t_source_daily: 2, t_processed_senti: 1 },
    });
  });
  it('测试写锁冲突时跳过复制，原子切换失败不清理当前表', async () => {
    const busy = setup({ busy: true });
    expect(await refresh(config)).toEqual({ status: 'busy' });
    expect(busy.sourceQueries).toHaveLength(0);
    jest.restoreAllMocks();
    const failed = setup({ state: 'success', failRename: true });
    await expect(refresh(config)).rejects.toThrow('lock wait timeout');
    expect(failed.targetQueries.some((q) => q.startsWith('DELETE FROM'))).toBe(
      false,
    );
    expect(failed.targetQueries.some((q) => q.includes('RELEASE_LOCK'))).toBe(
      true,
    );
  });
});
