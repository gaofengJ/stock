'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { changeClass, numberText, scaledNumber } from '@/utils/format';

export interface StockQuote {
  open: number | null; close: number | null; high: number | null; low: number | null;
  preClose: number | null; pctChg: number | null; vol: number | null;
  amount: number | null; turnoverRateF: number | null;
}
export interface StockPoint {
  date: string; open: number | null; close: number | null; high: number | null; low: number | null;
  vol: number | null; quote: StockQuote | null;
}
export interface StockQuoteHandle { select: (date: string | null) => void }

const StockQuotePanel = forwardRef<StockQuoteHandle, { series: StockPoint[]; basis: string; children: React.ReactNode }>((props, ref) => {
  const [date, setDate] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ select: setDate }), []);
  const row = props.series.find((point) => point.date === date);
  const q = row?.quote;
  let unavailable = '复权行情暂缺';
  if (!q) unavailable = '当日无可用行情';
  else if (q.vol === 0) unavailable = '当日无成交，未绘制K线';
  const amplitude = q?.preClose != null && q.preClose > 0 && q.high != null && q.low != null ? ((q.high - q.low) / q.preClose) * 100 : null;
  const fields = row ? [
    ['开盘', numberText(row.open)], ['最高', numberText(row.high)],
    ['最低', numberText(row.low)], ['收盘', numberText(row.close)],
    ['涨幅', q?.pctChg == null ? '未提供' : `${numberText(q.pctChg, 2, true)}%`],
    ['振幅', amplitude == null ? '未提供' : `${numberText(amplitude)}%`],
    ['成交量', q?.vol == null ? '未提供' : `${scaledNumber(q.vol, 10000)}万手`],
    ['成交额', q?.amount == null ? '未提供' : `${scaledNumber(q.amount, 100000)}亿元`],
    ['自由流通换手', q?.turnoverRateF == null ? '未提供' : `${numberText(q.turnoverRateF)}%`],
  ] : [];
  return (
    <div className="strategy-stock-quote" onMouseLeave={() => setDate(null)}>
      {props.children}
      {row && (
      <aside className="stock-quote-readout" aria-label="个股行情明细">
        <time>{row.date}</time>
        {row.close == null ? <p className="stock-quote-status">{unavailable}</p> : (
          <>
            <div className="stock-quote-status">{`${props.basis}价格（元）`}</div>
            <dl>
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={label === '涨幅' ? changeClass(q?.pctChg) : undefined}>{value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </aside>
      )}
    </div>
  );
});
StockQuotePanel.displayName = 'StockQuotePanel';
export default StockQuotePanel;
