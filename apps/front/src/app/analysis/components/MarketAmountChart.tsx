'use client';

import { memo } from 'react';
import { Card, Empty } from 'antd';
import { MarketSeries } from '@/api/market';
import CChart from '@/components/CChart';
import { chartColors, uiColors } from '@/colors';
import { numberText } from '@/utils/format';
import { ChartWindow, amountReferenceLevels, periodTotals } from './market-display';

function MarketAmountChart({
  data, window, title, dates,
}: { data: MarketSeries; window: ChartWindow; title: string; dates: string[] }) {
  const all = periodTotals(data.series.map((p) => ({ date: p.date, value: p.data?.amount })), dates, window.period);
  const rows = window.count ? all.slice(-window.count) : all;
  const references = amountReferenceLevels(rows.map((r) => r.value));
  return (
    <Card title={title} className="market-chart market-amount-chart">
      {!rows.some((r) => r.value != null) ? <Empty description="该范围暂无完整成交额数据" /> : (
        <CChart genOptions={() => ({
          tooltip: {
            trigger: 'axis',
            renderMode: 'richText',
            formatter: (params: any) => {
              const row = rows[(Array.isArray(params) ? params[0] : params)?.dataIndex];
              if (!row) return '';
              return `${row.start === row.end ? row.date : `${row.start} 至 ${row.end}`}\n成交额  ${numberText(row.value)} 亿元`;
            },
          },
          legend: { top: 0, data: ['成交额'] },
          grid: {
            left: 16, right: 20, top: 56, bottom: 24, containLabel: true,
          },
          xAxis: { type: 'category', data: rows.map((r) => r.date), axisLabel: { hideOverlap: true } },
          yAxis: {
            type: 'value', name: '亿元', nameGap: 16, max: references.at(-1), axisLabel: { formatter: (v: number) => numberText(v, 0) },
          },
          series: [{
            type: 'bar',
            name: '成交额',
            barMaxWidth: 24,
            data: rows.map((r) => r.value),
            itemStyle: { color: chartColors.blue },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { type: 'dashed', color: chartColors.reference, width: 1 },
              label: { position: 'insideEndTop', formatter: '{b}', color: uiColors.secondary },
              data: references.map((value) => ({ name: `${value / 10000}万亿`, yAxis: value })),
            },
          }],
        })}
        />
      )}
    </Card>
  );
}
export default memo(MarketAmountChart);
