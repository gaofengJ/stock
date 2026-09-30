export async function checkNewsSchema(db: {
  query: (sql: string, args?: any[]) => Promise<any>;
}) {
  const rows = await db.query(
    "SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('t_news_item','t_news_source','t_news_favorite') ORDER BY SEQ_IN_INDEX",
  );
  const expected = [
    { table: 't_news_source', name: 'PRIMARY', columns: ['source'] },
    {
      table: 't_news_item',
      name: 'uq_news_source_key',
      columns: ['source', 'dedupe_key'],
    },
    {
      table: 't_news_favorite',
      name: 'PRIMARY',
      columns: ['user_id', 'news_id'],
    },
  ];
  expected.forEach((key) => {
    const found = rows.filter(
      (row: any) => row.TABLE_NAME === key.table && row.INDEX_NAME === key.name,
    );
    if (
      found.length !== key.columns.length ||
      found.some(
        (row: any, n: number) =>
          Number(row.NON_UNIQUE) !== 0 || row.COLUMN_NAME !== key.columns[n],
      )
    )
      throw new Error(`News migration required: ${key.table}.${key.name}`);
  });
}
