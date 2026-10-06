import { EntityManager } from 'typeorm';
import { HistoricalStock } from './stock-history.entity';

function array(value: unknown): any[] {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (parsed == null) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Names and codes are mandatory in identity snapshots; their arrays stay aligned. */
export async function readHistoricNames(manager: EntityManager) {
  const [row] = await manager.query(
    `SELECT JSON_EXTRACT(data,'$.names[*].tsCode') codes,
       JSON_EXTRACT(data,'$.names[*].name') names
     FROM t_source_stock_history WHERE snapshot_key='identity'`,
  );
  const names = array(row?.names);
  return array(row?.codes).map((tsCode, index) => ({
    tsCode,
    name: names[index] as string,
  }));
}

/** Transfer archived profiles only when absent from the current stock directory. */
export async function readArchivedStocks(
  manager: EntityManager,
  currentCodes: Set<string>,
  canonical: (code: string) => string,
) {
  const [row] = await manager.query(
    `SELECT DATE_FORMAT(as_of,'%Y-%m-%d') asOf,
       JSON_EXTRACT(data,'$.stocks[*].tsCode') codes
     FROM t_source_stock_history WHERE snapshot_key='identity'`,
  );
  const paths = array(row?.codes).flatMap((code, index) =>
    currentCodes.has(canonical(code)) ? [] : [`$.stocks[${index}]`],
  );
  if (!paths.length)
    return { asOf: row?.asOf || null, stocks: [] as HistoricalStock[] };
  const [profiles] = await manager.query(
    `SELECT JSON_EXTRACT(data,${paths.map(() => '?').join(',')}) stocks
     FROM t_source_stock_history WHERE snapshot_key='identity'`,
    paths,
  );
  return {
    asOf: row.asOf,
    stocks: array(profiles?.stocks) as HistoricalStock[],
  };
}
