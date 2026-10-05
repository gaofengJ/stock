'use client';

import {
  forwardRef, useImperativeHandle, useState,
} from 'react';
import type { IndexPoint } from '@/api/market';
import { changeClass, numberText } from '@/utils/format';
import type { Candle } from './market-display';

export interface QuotePanelHandle { select: (date: string) => void }

interface QuotePanelProps {
  name: string;
  candles: (Candle & { volume: number | null })[];
  points: IndexPoint[];
  averages: { name: string; values: (number | null)[] }[];
  palette: string[];
  children: React.ReactNode;
}

const IndexQuotePanel = forwardRef<QuotePanelHandle, QuotePanelProps>(({
  name, candles, points, averages, palette, children,
}, ref) => {
  const [date, setDate] = useState('');
  useImperativeHandle(ref, () => ({ select: setDate }), []);
  const found = candles.findIndex((c) => c.date === date);
  const position = found < 0 ? candles.length - 1 : found;
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
    <div className="market-quote-panel">
      <div className="market-ma-readout" aria-label={`${name}均线数值`}>
        <strong>{name}</strong>
        {averages.map((average, i) => {
          const value = average.values[position];
          const prior = average.values[position - 1];
          let arrow = '';
          if (value != null && prior != null && value !== prior) arrow = value > prior ? '↑' : '↓';
          return <span key={average.name} style={{ color: palette[i] }}>{`${average.name}: ${numberText(value)}${arrow}`}</span>;
        })}
      </div>
      <div className="market-quote-body">
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
        <div className="market-quote-canvas">{children}</div>
      </div>
    </div>
  );
});

IndexQuotePanel.displayName = 'IndexQuotePanel';
export default IndexQuotePanel;
