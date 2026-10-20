import type { StockPoint } from './StockQuotePanel';

export type ChartPriceMode = 'raw' | 'strategy';

/** Keep strategy evidence intact; use the daily quote for the default price view. */
export function chartPriceView(data: {
  date: string; basis: string; series: StockPoint[];
  evidence: { breakoutPrice?: number; breakoutDate?: string } | null;
}, mode: ChartPriceMode) {
  if (mode === 'strategy') return data;
  const signal = data.series.find((point) => point.date === data.date);
  const ratio = signal?.close && signal.quote?.close ? signal.quote.close / signal.close : null;
  return {
    ...data,
    basis: '不复权',
    evidence: data.evidence ? {
      ...data.evidence,
      // An adjusted breakout level must be converted to the signal day's quote units.
      // Without that anchor, omit the line instead of drawing a misleading price.
      breakoutPrice: ratio && Number.isFinite(ratio) && ratio > 0 && data.evidence.breakoutPrice != null
        ? Math.round(data.evidence.breakoutPrice * ratio * 100) / 100 : undefined,
    } : null,
    series: data.series.map((point) => {
      const q = point.quote;
      const valid = q && q.vol != null && q.vol > 0
        && [q.open, q.close, q.high, q.low].every((price) => price != null && Number.isFinite(price) && price > 0);
      return {
        ...point,
        open: valid ? q.open : null,
        close: valid ? q.close : null,
        high: valid ? q.high : null,
        low: valid ? q.low : null,
        vol: valid ? q.vol : null,
      };
    }),
  };
}
