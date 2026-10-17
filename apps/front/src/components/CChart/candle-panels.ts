import { quoteColors } from '@/colors';
import type { calculateMacd } from './macd';

/** Three aligned panes share the same date axis and zoom; price keeps most of the height. */
export function candleGrids(height: number, top = 36, left = 64) {
  // Leave room above and below pane titles without pushing compact charts out of bounds.
  const available = Math.max(0, height - top - 56);
  const gap = Math.min(height < 360 ? 36 : 44, available / 3);
  const usable = available - 2 * gap;
  const price = usable * 0.64;
  const volume = usable * 0.14;
  return [
    {
      left, right: 44, top, height: price,
    },
    {
      left, right: 44, top: top + price + gap, height: volume,
    },
    {
      left, right: 44, top: top + price + volume + 2 * gap, height: usable * 0.22,
    },
  ];
}

export function macdSeries(values: ReturnType<typeof calculateMacd>) {
  return [{
    type: 'line' as const, name: 'DIF', xAxisIndex: 2, yAxisIndex: 2, data: values.dif, showSymbol: false, connectNulls: false, lineStyle: { width: 1.2, color: '#e5ac35' }, itemStyle: { color: '#e5ac35' },
  }, {
    type: 'line' as const, name: 'DEA', xAxisIndex: 2, yAxisIndex: 2, data: values.dea, showSymbol: false, connectNulls: false, lineStyle: { width: 1.2, color: '#a972df' }, itemStyle: { color: '#a972df' },
  }, {
    type: 'bar' as const, name: 'MACD', xAxisIndex: 2, yAxisIndex: 2, barMaxWidth: 8, itemStyle: { color: quoteColors.up }, data: values.histogram.map((value) => ({ value, itemStyle: { color: value == null || value >= 0 ? quoteColors.up : quoteColors.down } })),
  }];
}
