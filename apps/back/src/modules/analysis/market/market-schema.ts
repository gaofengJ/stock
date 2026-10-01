/** 启动与发布共用的只读校验，避免新增阶段在未迁移数据库上运行。 */
export async function checkMarketSchema(db: {
  query: (sql: string) => Promise<any>;
}) {
  const rows = await db.query(
    'SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,NON_UNIQUE,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY SEQ_IN_INDEX',
  );
  const expected = [
    ['t_source_ths_sector', 'uq_ths_sector_code', ['ts_code']],
    ['t_source_ths_members', 'uq_ths_members_date_code', ['as_of', 'ts_code']],
    ['t_source_ths_daily', 'uq_ths_daily_date_code', ['trade_date', 'ts_code']],
    ['t_source_index_daily', 'uq_index_date_code', ['trade_date', 'ts_code']],
    [
      't_processed_market_daily',
      'uq_market_date_scope',
      ['trade_date', 'scope'],
    ],
    ['t_source_bse_mapping', 'uq_bse_old', ['old_code']],
    [
      't_processed_market_breadth',
      'uq_breadth_date_scope',
      ['trade_date', 'scope'],
    ],
  ] as const;
  const bad = expected.filter(([table, index, columns]) => {
    const found = rows.filter(
      (r: any) => r.TABLE_NAME === table && r.INDEX_NAME === index,
    );
    return (
      found.length !== columns.length ||
      found.some(
        (r: any, i: number) =>
          Number(r.NON_UNIQUE) !== 0 || r.COLUMN_NAME !== columns[i],
      )
    );
  });
  const columns = await db.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_admin_job' AND COLUMN_NAME='mode'",
  );
  if (bad.length || columns.length !== 1)
    throw new Error(
      '市场分析数据库结构未就绪，请先执行市场分析、MarketBreadth1790899200000 和 ThsSectors1790985600000 迁移',
    );
}
