import dayjs from 'dayjs';
import { beijingTime } from '@/utils/format';
import type { Row } from '@/components/LiveResearch/data';

export const currentBrokerMonth = () => beijingTime(new Date().toISOString()).slice(0, 7);
export const validStockCode = (code: string) => /^\d{6}\.(SH|SZ|BJ)$/.test(code);

export function brokerMonth(value: string | null, current = currentBrokerMonth()) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    && dayjs(`${value}-01`).format('YYYY-MM') === value && value <= current ? value : current;
}

export function brokerRows(rows: Row[], month: string): Row[] {
  const result = new Map<string, Row>();
  rows.forEach((row) => {
    if (String(row.month).replace('-', '') !== month.replace('-', '')) return;
    const broker = String(row.broker ?? '').trim();
    const code = String(row.ts_code ?? '').trim().toUpperCase();
    const name = String(row.name ?? '').trim();
    const key = JSON.stringify([month, broker, validStockCode(code) ? code : [code, name]]);
    if (!result.has(key)) {
      result.set(key, {
        key, month, broker, ts_code: code, name,
      });
    }
  });
  return Array.from(result.values()).sort((a, b) => a.broker.localeCompare(b.broker, 'zh-CN') || a.ts_code.localeCompare(b.ts_code));
}

export function filterBrokerRows(rows: Row[], broker: string, keyword: string) {
  const term = keyword.trim().toLowerCase();
  return rows.filter((r) => (!broker || r.broker === broker) && `${r.ts_code} ${r.name}`.toLowerCase().includes(term));
}

export function brokerStockHref(code: string, month: string, today = beijingTime(new Date().toISOString()).slice(0, 10)) {
  const end = dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD');
  return `/basic/stock/detail/?${new URLSearchParams({ code, date: end > today ? today : end })}`;
}
