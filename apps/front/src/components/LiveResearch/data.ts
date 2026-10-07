import { finiteNumber } from '@/utils/format';

export type Row = Record<string, any>;
export const sourceLabels: Record<string, string> = {
  moneyflow_ths: '同花顺个股资金',
  moneyflow_ind_ths: '同花顺行业资金',
  moneyflow_cnt_ths: '同花顺概念资金',
  moneyflow_mkt_dc: '东方财富市场资金',
  margin: '交易所两融汇总',
  margin_detail: '交易所两融明细',
  margin_secs: '交易所两融标的',
  top10_holders: '十大股东资料',
  top10_floatholders: '十大流通股东资料',
  stk_holdernumber: '股东户数资料',
  fina_mainbz: '主营构成资料',
  pledge_stat: '质押统计',
  pledge_detail: '质押公告资料',
  repurchase: '回购公告资料',
  income: '利润表',
  balancesheet: '资产负债表',
  fina_indicator: '财务指标',
  cashflow: '现金流量表',
  stk_surv: '机构调研资料',
  broker_recommend: '券商月度金股名单',
};
export type Source = { source: string; state: 'ready' | 'error'; message: string | null; fetchedAt: string; rows: Row[] };
export type Research = {
  date?: string; code?: string; section?: string; sources: Source[]; month?: string;
  financial?: Row[]; holders?: { period: string; previousPeriod: string; rows: Row[]; exited: Row[] };
  floatHolders?: Research['holders'];
};
export const dateText = (value: unknown) => {
  const raw = String(value ?? '').replace(/-/g, '').slice(0, 8);
  return /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}` : '—';
};
export const newest = (rows: Row[], field = 'trade_date') => [...rows].sort((a, b) => String(b[field]).localeCompare(String(a[field])));
export function researchAverage(rows: Row[], field: string, divisor = 1) {
  const values = rows.map((row) => finiteNumber(row[field])).filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length / divisor : null;
}
export function businessRows(rows: Row[]): Row[] {
  const period = newest(rows, 'end_date')[0]?.end_date;
  const map = new Map<string, Row>();
  rows.filter((r) => r.end_date === period).sort((a, b) => Number(b.update_flag || 0) - Number(a.update_flag || 0)).forEach((r) => {
    const key = JSON.stringify([r.bz_item, r.bz_code, r.curr_type]);
    if (!map.has(key)) map.set(key, r);
  });
  const selected = Array.from(map.values());
  return selected.map((r) => {
    const group = selected.filter((v) => v.curr_type === r.curr_type);
    const values = group.map((v) => finiteNumber(v.bz_sales));
    const safe = values.every((v) => v != null && v >= 0) && !group.some((v) => /合计|总计|小计/.test(v.bz_item || ''));
    const total = safe ? values.reduce<number>((sum, v) => sum + (v as number), 0) : 0;
    const revenue = finiteNumber(r.bz_sales); const profit = finiteNumber(r.bz_profit);
    return { ...r, listed_share: total > 0 && revenue != null ? (revenue / total) * 100 : null, profit_margin: revenue != null && revenue > 0 && profit != null ? (profit / revenue) * 100 : null };
  });
}
/** Never aggregate an incomplete exchange set or replace absent values with zero. */
export function marginTotals(rows: Row[]) {
  const exchanges = ['SSE', 'SZSE'];
  const map = new Map<string, Row[]>();
  rows.forEach((r) => map.set(r.trade_date, [...(map.get(r.trade_date) || []), r]));
  return Array.from(map).map(([tradeDate, group]) => {
    const seen = new Map(group.map((r) => [r.exchange_id, r]));
    const complete = exchanges.every((key) => seen.has(key));
    const result: Row = { trade_date: tradeDate, complete, exchanges: Array.from(seen.keys()).join(' / ') };
    ['rzye', 'rzmre', 'rzche', 'rqye', 'rzrqye'].forEach((field) => {
      const values = exchanges.map((key) => finiteNumber(seen.get(key)?.[field]));
      result[field] = complete && values.every((v) => v != null) ? values.reduce<number>((sum, v) => sum + (v as number), 0) : null;
    });
    return result;
  }).sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)));
}
