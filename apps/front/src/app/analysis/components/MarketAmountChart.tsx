'use client';

import { memo } from 'react';
import { Card, Empty } from 'antd';
import { MarketSeries } from '@/api/market';
import CChart from '@/components/CChart';
import { useSiteTheme } from '@/components/SiteTheme';
import HelpTooltip from '@/components/HelpTooltip';
import { chartColors, quoteColors } from '@/colors';
import { numberText } from '@/utils/format';
import { ChartWindow, amountReferenceLevels, periodTotals } from './market-display';
import ChartRange from './ChartRange';
import { relativeChange } from './market-environment';
import { overviewDateAxis, overviewGrid } from './overview-chart';

function MarketAmountChart({
  data, window, title, dates, onWindowChange,
}: { data: MarketSeries; window: ChartWindow; title: string; dates: string[]; onWindowChange: (value: ChartWindow) => void }) {
  const { colors } = useSiteTheme();
  const all = periodTotals(data.series.map((p) => ({ date: p.date, value: p.data?.amount })), dates, window.period);
  const rows = window.count ? all.slice(-window.count) : all;
  const references = amountReferenceLevels(rows.map((r) => r.value));
  return (
    <Card
      title={(
        <span className="market-section-title">
          {title}
          <HelpTooltip label="市场成交额" title="按所选范围汇总A股成交额，周/月为周期合计。" />
        </span>
)}
      extra={<ChartRange value={window} onChange={onWindowChange} />}
      className="market-chart market-amount-chart"
    >
      <div className="market-amount-summary">
        <span>
          <span>当日成交额</span>
          <strong>{numberText(data.snapshot?.amount)}</strong>
          <span>亿元</span>
        </span>
        <span>
          <span>较上一交易日</span>
          <strong>{numberText(data.snapshot && data.previousAmount != null ? data.snapshot.amount - data.previousAmount : null, 2, true)}</strong>
          <span>亿元</span>
        </span>
      </div>
      <div className="market-volume-baselines">
        {[{ days: 5, mean: data.fiveDayAmount }, { days: 20, mean: data.twentyDayAmount }].map(({ days, mean }) => (
          <div key={days}>
            <span className="market-volume-baseline-label">
              {`前${days}日均额`}
              <HelpTooltip label={`前${days}日均额`} title={`前${days}个交易日均额，不含当日；缺失任一天则不计算。`} />
            </span>
            <div>
              <strong>{numberText(mean)}</strong>
              <span>亿元</span>
            </div>
            <span>{`当日较均额 ${numberText(relativeChange(data.snapshot?.amount, mean), 2, true)}%`}</span>
          </div>
        ))}
      </div>
      {!!rows.length && <div className="market-environment-caption">{`区间 ${rows[0].start} → ${rows.at(-1)!.end}`}</div>}
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
          grid: overviewGrid,
          xAxis: overviewDateAxis(rows.map((r) => r.date)),
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
              label: { position: 'insideEndTop', formatter: '{b}', color: colors.secondary },
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
