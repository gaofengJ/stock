import { DataSource } from 'typeorm';
import { StockHistoryEntity } from '@/modules/source/stock/stock-history.entity';

const parsed = (value: any) => {
  if (typeof value !== 'string' || value.startsWith('$')) return value;
  return JSON.parse(value);
};
const list = (value: any) => {
  const data = parsed(value);
  if (data == null) return [];
  return Array.isArray(data) ? data : [data];
};

/** MySQL 5.7 projection: transfer only this stock's identity rows, not the 5+ MB catalog. */
export async function readProfileHistory(
  db: DataSource,
  codes: string[],
): Promise<Pick<StockHistoryEntity, 'asOf' | 'data'> | null> {
  const searches = codes.flatMap((_, index) => [
    `JSON_SEARCH(data, 'all', ?, NULL, '$.stocks[*].tsCode') stock${index}`,
    `JSON_SEARCH(data, 'all', ?, NULL, '$.names[*].tsCode') name${index}`,
  ]);
  const [match] = await db.query(
    `SELECT DATE_FORMAT(as_of,'%Y-%m-%d') asOf, ${searches.join(
      ',',
    )} FROM t_source_stock_history WHERE snapshot_key='identity'`,
    codes.flatMap((code) => [code, code]),
  );
  if (!match) return null;
  const paths = (prefix: string, field: string) =>
    [...new Set(codes.flatMap((_, index) => list(match[`${prefix}${index}`])))]
      .filter((path) =>
        new RegExp(`^\\$\\.${field}\\[\\d+\\]\\.tsCode$`).test(path),
      )
      .map((path: string) => path.replace(/\.tsCode$/, ''));
  const stockPaths = paths('stock', 'stocks');
  const namePaths = paths('name', 'names');
  if (!stockPaths.length && !namePaths.length)
    return { asOf: match.asOf, data: { stocks: [], names: [] } };
  const projection = (values: string[], alias: string) =>
    `${
      values.length
        ? `JSON_EXTRACT(data,${values.map(() => '?').join(',')})`
        : 'NULL'
    } ${alias}`;
  const [row] = await db.query(
    `SELECT ${projection(stockPaths, 'stocks')},${projection(
      namePaths,
      'names',
    )} FROM t_source_stock_history WHERE snapshot_key='identity'`,
    [...stockPaths, ...namePaths],
  );
  return {
    asOf: match.asOf,
    data: {
      stocks: list(row?.stocks).filter((stock) => codes.includes(stock.tsCode)),
      names: list(row?.names).filter((name) => codes.includes(name.tsCode)),
    },
  };
}
