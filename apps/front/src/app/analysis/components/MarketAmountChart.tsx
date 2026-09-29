'use client';

import { memo } from 'react';
import { Card, Empty } from 'antd';
import { MarketSeries } from '@/api/market';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { chartColors, uiColors, quoteColors } from '@/colors';
import { numberText } from '@/utils/format';
import { ChartWindow, amountReferenceLevels, periodTotals } from './market-display';
import ChartRange from './ChartRange';

function MarketAmountChart({
  data, window, title, dates, onWindowChange,
}: { data: MarketSeries; window: ChartWindow; title: string; dates: string[]; onWindowChange: (value: ChartWindow) => void }) {
  const all = periodTotals(data.series.map((p) => ({ date: p.date, value: p.data?.amount })), dates, window.period);
  const rows = window.count ? all.slice(-window.count) : all;
  const references = amountReferenceLevels(rows.map((r) => r.value));
  return (
    <Card
      title={(
        <span className="market-section-title">
          {title}
          <HelpTooltip label="市场成交额" title="按顶部统计范围汇总A股成交额，不跟随单个指数选择。范围没有唯一的涨跌指标，成交额统一使用红柱。周/月为周期内成交额合计。" />
        </span>
)}
      extra={<ChartRange value={window} onChange={onWindowChange} />}
      className="market-chart market-amount-chart"
    >
      <div className="market-amount-summary">
        <span>
          当日成交额
          <strong>{numberText(data.snapshot?.amount)}</strong>
          {' '}
          亿元
        </span>
        <span>
          较上一交易日
          {numberText(data.snapshot && data.previousAmount != null ? data.snapshot.amount - data.previousAmount : null, 2, true)}
          {' '}
          亿元
        </span>
      </div>
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
            itemStyle: { color: quoteColors.up },
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
