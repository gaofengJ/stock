import type { CandlestickSeriesOption } from 'echarts/charts';
import { numberText } from '@/utils/format';

// ECharts calculates these against the filtered candle data on every zoom.
// Explicit dimensions use wick prices rather than the default closing price.
export default function candleExtremaMarks(color: string, backgroundColor?: string): CandlestickSeriesOption['markPoint'] {
  return {
    silent: true,
    animation: false,
    z: 6,
    symbol: 'circle',
    symbolSize: 5,
    itemStyle: { color, borderWidth: 0 },
    label: {
      color,
      fontSize: 11,
      lineHeight: 14,
      backgroundColor,
      padding: [2, 4],
      borderRadius: 3,
      distance: 6,
      formatter: (params) => `${params.name}\n${numberText(params.value)}`,
    },
    data: [
      {
        name: '最高', type: 'max', valueDim: 'highest', label: { position: 'top' },
      },
      {
        name: '最低', type: 'min', valueDim: 'lowest', label: { position: 'bottom' },
      },
    ],
  };
}
