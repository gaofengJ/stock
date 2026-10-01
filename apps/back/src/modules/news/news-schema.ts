import { NEWS_SOURCES } from './news.sources';

export async function checkNewsSchema(db: {
  query: (sql: string, args?: any[]) => Promise<any>;
}) {
  const rows = await db.query(
    "SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('t_news_item','t_news_source','t_news_translation','t_news_rule','t_news_stock','t_news_preference','t_news_read') ORDER BY SEQ_IN_INDEX",
  );
  const expected = [
    { table: 't_news_source', name: 'PRIMARY', columns: ['source'] },
    { table: 't_news_translation', name: 'PRIMARY', columns: ['news_id'] },
    { table: 't_news_rule', name: 'PRIMARY', columns: ['news_id'] },
    { table: 't_news_stock', name: 'PRIMARY', columns: ['news_id', 'ts_code'] },
    { table: 't_news_preference', name: 'PRIMARY', columns: ['user_id'] },
    { table: 't_news_read', name: 'PRIMARY', columns: ['user_id', 'news_id'] },
    {
      table: 't_news_item',
      name: 'uq_news_source_key',
      columns: ['source', 'dedupe_key'],
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
  const sources = await db.query('SELECT source FROM t_news_source');
  if (
    NEWS_SOURCES.some(
      (source) => !sources.some((row: any) => row.source === source.code),
    )
  )
    throw new Error('News source configuration migration required');
}
