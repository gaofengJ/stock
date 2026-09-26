// Operational script is intentionally CommonJS for the existing server runtime.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { validateConfig, TABLES } = require('../../ops/test-db/refresh.cjs');

describe('服务器测试库刷新边界', () => {
  it('拒绝生产库作为写入目标，以及源目标相同', () => {
    expect(() =>
      validateConfig({ source: 'stock', target: 'stock', days: 30 }),
    ).toThrow();
    expect(() =>
      validateConfig({ source: 'stock_test', target: 'stock_test', days: 30 }),
    ).toThrow();
    expect(() =>
      validateConfig({ source: 'stock', target: 'stock_test', days: 30 }),
    ).not.toThrow();
  });
  it('拒绝不受限的数据窗口和非法标识符', () => {
    [0, -1, 999, 1.5].forEach((days) => {
      expect(() =>
        validateConfig({ source: 'stock', target: 'stock_test', days }),
      ).toThrow();
    });
    expect(() =>
      validateConfig({
        source: 'stock; DROP DATABASE stock',
        target: 'stock_test',
        days: 30,
      }),
    ).toThrow();
  });
  it('只发布行情表，不覆盖账号、权限和迁移记录', () => {
    expect(TABLES).toHaveLength(6);
    expect(TABLES).not.toEqual(expect.arrayContaining(['t_user']));
    expect(TABLES).not.toEqual(expect.arrayContaining(['t_role']));
    expect(TABLES).not.toEqual(expect.arrayContaining(['migrations']));
  });
});
