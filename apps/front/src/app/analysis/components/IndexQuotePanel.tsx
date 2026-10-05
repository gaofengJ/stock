'use client';

import {
  forwardRef, useImperativeHandle, useState,
} from 'react';
import type { IndexPoint } from '@/api/market';
import { changeClass, numberText } from '@/utils/format';
import type { Candle } from './market-display';

export interface QuotePanelHandle { select: (date: string | null) => void }

interface QuotePanelProps {
  name: string;
  candles: (Candle & { volume: number | null })[];
  points: IndexPoint[];
  children: React.ReactNode;
}

export function IndexQuoteReadout({
  name, candles, points, date,
}: Omit<QuotePanelProps, 'children'> & { date: string | null }) {
  const position = candles.findIndex((c) => c.date === date);
  if (position < 0) return null;
  const candle = candles[position];
  const price = candle?.value;
  const source = points.find((point) => point.date === candle?.start);
  const previous = source?.preClose;
  const change = price && previous != null && previous > 0 ? price[1] - previous : null;
  const ratio = change != null && previous ? (change / previous) * 100 : null;
  const amplitude = price && previous != null && previous > 0 ? ((price[3] - price[2]) / previous) * 100 : null;
  const periodPoints = candle ? points.filter((point) => point.date >= candle.start && point.date <= candle.end) : [];
  // index_daily amount is 千元, displayed as 亿元; never fabricate missing amounts.
  const amount = price && periodPoints.length && periodPoints.every((p) => p.amount != null && Number.isFinite(p.amount)) ? periodPoints.reduce((sum, p) => sum + p.amount, 0) / 100000 : null;
  const fields = [
    { label: '开盘', value: price?.[0], compare: price && previous != null ? price[0] - previous : null },
    { label: '最高', value: price?.[3], compare: price && previous != null ? price[3] - previous : null },
    { label: '最低', value: price?.[2], compare: price && previous != null ? price[2] - previous : null },
    { label: '收盘', value: price?.[1], compare: change },
    {
      label: '涨跌', value: change, compare: change, signed: true,
    },
    {
      label: '涨幅', value: ratio, compare: change, signed: true, unit: '%',
    },
    { label: '振幅', value: amplitude, unit: '%' },
    { label: '成交量', value: candle?.volume, unit: '万手' },
    { label: '成交额', value: amount, unit: '亿元' },
  ];
  return (
    <div className="market-quote-overlay">
      <aside className="market-quote-readout" aria-label={`${name}行情明细`}>
        <time>{candle?.date}</time>
        {candle && candle.start !== candle.end && <span className="market-quote-start">{`${candle.start} 起`}</span>}
        <dl>
          {fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd className={field.compare == null ? undefined : changeClass(field.compare)}>
                {numberText(field.value, 2, field.signed)}
                {field.value != null && field.unit && <small>{field.unit}</small>}
              </dd>
            </div>
          ))}
        </dl>
      </aside>

    </div>
  );
}

const IndexQuotePanel = forwardRef<QuotePanelHandle, QuotePanelProps>((props, ref) => {
  const [date, setDate] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ select: setDate }), []);
  return (
    <div className="market-quote-panel" onMouseLeave={() => setDate(null)}>
      {props.children}
      <IndexQuoteReadout name={props.name} candles={props.candles} points={props.points} date={date} />
    </div>
  );
});

IndexQuotePanel.displayName = 'IndexQuotePanel';
export default IndexQuotePanel;
