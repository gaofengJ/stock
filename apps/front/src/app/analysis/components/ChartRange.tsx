'use client';

import { Segmented, Select } from 'antd';
import {
  CandlePeriod, ChartWindow, chartRanges, defaultChartCounts,
} from './market-display';

export default function ChartRange({ value, onChange }: { value: ChartWindow; onChange: (value: ChartWindow) => void }) {
  const unit = { day: '个交易日', week: '周', month: '月' }[value.period];
  return (
    <div className="market-chart-controls">
      <Segmented aria-label="图表周期" value={value.period} onChange={(period) => onChange({ period: period as CandlePeriod, count: defaultChartCounts[period as CandlePeriod] })} options={[{ value: 'day', label: '日' }, { value: 'week', label: '周' }, { value: 'month', label: '月' }]} />
      <Select aria-label="图表日期范围" value={value.count} onChange={(count) => onChange({ ...value, count })} options={chartRanges[value.period].map((count) => ({ value: count, label: count ? `近${count}${unit}` : '全部（最多两年）' }))} />
    </div>
  );
}
