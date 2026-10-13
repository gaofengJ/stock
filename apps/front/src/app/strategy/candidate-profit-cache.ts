import { sourcePending } from '../basic/components/workbench-polling';

export type ProfitRow = {
  tsCode: string; status: 'unknown' | 'loss' | 'profit' | 'flat'; amount: number | null;
  reportDate: string | null; announcedAt: string | null; sourceState: string; message?: string | null;
  history: { status: string; amount: number | null; reportDate: string | null; announcedAt: string | null }[];
  forecast: { reportDate: string; announcedAt: string; type: string; profitMin: number | null; profitMax: number | null; changeMin: number | null; changeMax: number | null } | null;
  forecastState: string; forecastMessage?: string | null;
};

export const profitPending = (row: ProfitRow) => sourcePending({ source: 'fina_indicator', state: row.sourceState as any, message: row.message })
  || sourcePending({ source: 'forecast', state: row.forecastState as any, message: row.forecastMessage });

/** Local to one mounted page; date remains part of the historical-data identity. */
export function createProfitCache(lifetime = 120000, capacity = 12000) {
  const entries = new Map<string, { row: ProfitRow; at: number }>();
  return {
    read(date: string, codes: string[], force = false) {
      const rows = new Map<string, ProfitRow>();
      const pending: string[] = [];
      Array.from(new Set(codes)).forEach((code) => {
        const cached = entries.get(`${date}:${code}`);
        if (cached) rows.set(code, cached.row);
        if (force || !cached || profitPending(cached.row) || cached.row.sourceState === 'error' || cached.row.forecastState === 'error' || Date.now() - cached.at >= lifetime) pending.push(code);
      });
      return { rows, pending };
    },
    write(date: string, rows: ProfitRow[]) {
      rows.forEach((row) => {
        const key = `${date}:${row.tsCode}`;
        entries.delete(key);
        entries.set(key, { row, at: Date.now() });
      });
      while (entries.size > capacity) entries.delete(entries.keys().next().value!);
    },
  };
}
