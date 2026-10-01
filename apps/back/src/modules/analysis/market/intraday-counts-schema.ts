export async function checkIntradayCountsSchema(db: {
  query: (sql: string) => Promise<any>;
}) {
  const rows = await db.query(
    "SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_market_intraday_counts' AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX",
  );
  if (
    rows.length !== 2 ||
    rows[0].COLUMN_NAME !== 'trade_date' ||
    rows[1].COLUMN_NAME !== 'sample_time' ||
    rows.some((row: any) => Number(row.NON_UNIQUE) !== 0)
  )
    throw new Error('盘中涨跌家数结构未就绪，请先执行 IntradayCounts 迁移');
}
