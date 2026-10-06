import { useEffect, useState } from 'react';
import { Button, Tooltip } from 'antd';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import { scaledNumber } from '@/utils/format';
import { sourcePending, startWorkbenchPolling } from '../basic/components/workbench-polling';

type ProfitRow = {
  tsCode: string; status: 'unknown' | 'loss' | 'profit' | 'flat'; amount: number | null;
  reportDate: string | null; announcedAt: string | null; sourceState: string; message?: string | null;
  history: { status: string; amount: number | null; reportDate: string | null; announcedAt: string | null }[];
  forecast: { reportDate: string; announcedAt: string; type: string; profitMin: number | null; profitMax: number | null; changeMin: number | null; changeMax: number | null } | null;
  forecastState: string; forecastMessage?: string | null;
};
export function useCandidateProfit(date: string, codes: string[], enabled: boolean) {
  const key = JSON.stringify([date, [...codes].sort()]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: Map<string, ProfitRow>; error: string; stopped: boolean }>({
    key: '', rows: new Map(), error: '', stopped: false,
  });
  useEffect(() => {
    if (!enabled || !date || !codes.length) return undefined;
    const [asOf, stockCodes] = JSON.parse(key) as [string, string[]];
    const rows = new Map<string, ProfitRow>();
    let pending = stockCodes;
    setResult({
      key, rows, error: '', stopped: false,
    });
    return startWorkbenchPolling({
      read: async (signal) => {
        const sources: any[] = [];
        const next: string[] = [];
        for (let i = 0; i < pending.length; i += 200) {
          // eslint-disable-next-line no-await-in-loop
          const { data } = await request.get<{ items: ProfitRow[]; sources: any[] }>('/strategy/candidate-financials', {
            params: { date: asOf, codes: pending.slice(i, i + 200).join(',') }, signal, timeout: 20000, autoShowError: false,
          });
          if (signal.aborted) return { sources: [] };
          data.items.forEach((row) => { rows.set(row.tsCode, row); if (sourcePending({ source: 'fina_indicator', state: row.sourceState as any, message: row.message }) || sourcePending({ source: 'forecast', state: row.forecastState as any, message: row.forecastMessage })) next.push(row.tsCode); });
          sources.push(...data.sources);
        }
        pending = next;
        return { sources };
      },
      onValue: () => setResult({
        key, rows: new Map(rows), error: '', stopped: false,
      }),
      onError: (error) => setResult({
        key, rows: new Map(rows), error: errorMessage(error, '财务资料加载失败'), stopped: true,
      }),
      onStopped: () => setResult((old) => ({ ...old, stopped: true })),
    });
  }, [key, enabled, date, codes.length, attempt]);
  return {
    ...result, error: result.key === key ? result.error : '', stopped: result.key === key && result.stopped, rows: result.key === key ? result.rows : new Map<string, ProfitRow>(), retry: () => setAttempt((value) => value + 1),
  };
}

export const reportLabel = (date?: string | null) => (date ? date.slice(2, 4) + ({
  '03-31': '一季', '06-30': '中报', '09-30': '三季', '12-31': '年报',
}[date.slice(5)] || date.slice(5)) : '未知期');
const profitLabels: Record<string, string> = {
  loss: '亏', profit: '盈', flat: '平', unknown: '未知',
};

export default function CandidateProfit({
  row, error, stopped, retry,
}: { row?: ProfitRow; error: string; stopped: boolean; retry: () => void }) {
  const financialPending = !row || sourcePending({ source: 'fina_indicator', state: row.sourceState as any, message: row.message });
  const forecastPending = !row || sourcePending({ source: 'forecast', state: row.forecastState as any, message: row.forecastMessage });
  const status = (pending: boolean, failed: boolean, empty: string) => {
    if (error || failed || (stopped && pending)) return <Button type="link" size="small" onClick={retry}>重新获取</Button>;
    return <span className="quote-muted">{pending ? '补齐中…' : empty}</span>;
  };
  const forecast = row?.forecast;
  return (
    <Tooltip title={(
      <div style={{ maxWidth: 360 }}>
        <div>财报：扣非净利润，按报告期累计；负数为亏损</div>
        {row?.history?.map((report) => (
          <div key={report.reportDate}>
            {report.reportDate}
            ：
            {scaledNumber(report.amount, 10000)}
            {' '}
            万元（披露
            {' '}
            {report.announcedAt}
            ）
          </div>
        ))}
        {row?.sourceState === 'stale' && <div>{row.message || '财报正在更新'}</div>}
        {forecast && (
        <>
          <div style={{ marginTop: 8 }}>
            业绩预告：
            {forecast.reportDate}
            {' '}
            ·
            {forecast.type}
            （公告
            {forecast.announcedAt}
            ）
          </div>
          {(forecast.profitMin != null || forecast.profitMax != null) && (
          <div>
            净利润区间：
            {scaledNumber(forecast.profitMin, 1)}
            {' '}
            ～
            {scaledNumber(forecast.profitMax, 1)}
            {' '}
            万元
          </div>
          )}
          {(forecast.changeMin != null || forecast.changeMax != null) && (
          <div>
            同比变动：
            {scaledNumber(forecast.changeMin, 1)}
            % ～
            {scaledNumber(forecast.changeMax, 1)}
            %
          </div>
          )}
          <div>预告净利润与财报扣非净利润口径不同</div>
        </>
        )}
        {row?.forecastState === 'stale' && <div>{row.forecastMessage || '预告正在更新'}</div>}
        {error && <div>{error}</div>}
      </div>
  )}
    >
      <div style={{ fontSize: 12, lineHeight: '22px' }}>
        <div>
          <span className="quote-muted">扣非 </span>
          {row?.history?.length ? row.history.map((report, i) => (
            <span key={report.reportDate}>
              {i > 0 && ' · '}
              <span style={{ color: report.status === 'loss' ? '#faad14' : undefined }}>
                {reportLabel(report.reportDate)}
                {profitLabels[report.status]}
              </span>
            </span>
          )) : status(financialPending, row?.sourceState === 'error', '暂无财报')}
        </div>
        <div>
          <span className="quote-muted">预告 </span>
          {forecast ? (
            <span>
              {reportLabel(forecast.reportDate)}
              {' '}
              {forecast.type}
              {row?.reportDate && forecast.reportDate <= row.reportDate ? '（已披露）' : ''}
            </span>
          ) : status(forecastPending, row?.forecastState === 'error', '无已披露预告')}
        </div>
      </div>
    </Tooltip>
  );
}
