'use client';

import { memo, useState } from 'react';
import {
  Card, Empty, Segmented, Select,
} from 'antd';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { MarketSeries } from '@/api/market';
import { numberText } from '@/utils/format';
import { movingAverageColors, quoteColors, withAlpha } from '@/colors';
import {
  CandlePeriod, indexCandles, movingAverage, averagePeriods, unfilledGaps,
} from './market-display';

function IndexChart({ index, dates }: { index: MarketSeries['indexes'][number] | undefined; dates: string[] }) {
  const [period, setPeriod] = useState<CandlePeriod>('day');
  const [count, setCount] = useState(60);
  const all = indexCandles(index?.series || [], dates, period);
  const candles = count === 0 ? all : all.slice(-count);
  const offset = all.length - candles.length;
  const averages = averagePeriods.map((n) => ({ name: `MA${n}`, values: movingAverage(all, n).slice(offset) }));
  const gaps = unfilledGaps(all);
  const periodName = { day: '个交易日', week: '周', month: '月' }[period];
  const ranges = { day: [20, 60, 120, 0], week: [12, 26, 52, 0], month: [6, 12, 0] }[period];
  return (
    <Card
      className="market-chart market-index-chart"
      title={(
        <span className="market-section-title">
          {index?.name || '指数'}
          <HelpTooltip label="指数走势" title="MA为当前周期收盘均线（日K为日均线，周/月K为周/月均线），点击图例可开关；不足周期留空。色带标出截至所选日期未回补的跳空缺口，部分回补后仅保留剩余区间。周/月K由日线汇总，首尾周期可能不完整，最多展示两年数据。" />
        </span>
      )}
      extra={(
        <div className="market-chart-controls">
          <Segmented aria-label="K线周期" value={period} onChange={(value) => { setPeriod(value as CandlePeriod); setCount({ day: 60, week: 26, month: 12 }[value as CandlePeriod]); }} options={[{ value: 'day', label: '日K' }, { value: 'week', label: '周K' }, { value: 'month', label: '月K' }]} />
          <Select aria-label="K线范围" value={count} onChange={setCount} options={ranges.map((value) => ({ value, label: value ? `近${value}${periodName}` : '全部（最多两年）' }))} />
        </div>
      )}
    >
      {!candles.some((c) => c.value) ? <Empty description="该范围暂无完整K线数据" /> : (
        <CChart genOptions={() => ({
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            renderMode: 'richText',
            formatter: (params: any) => {
              const candle = candles[(Array.isArray(params) ? params[0] : params)?.dataIndex];
              if (!candle) return '';
              const date = candle.start === candle.end ? candle.date : `${candle.start} 至 ${candle.end}`;
              const values = Array.isArray(params) ? params : [params];
              const lines = values.filter((p: any) => p.seriesType === 'line').map((p: any) => `${p.seriesName}  ${numberText(p.value)} 点`).join('\n');
              return candle.value ? `${date}\n开盘  ${numberText(candle.value[0])} 点\n收盘  ${numberText(candle.value[1])} 点\n最高  ${numberText(candle.value[3])} 点\n最低  ${numberText(candle.value[2])} 点${lines ? `\n${lines}` : ''}` : `${date}\n数据不完整`;
            },
          },
          grid: {
            left: 16, right: 20, top: 60, bottom: 24, containLabel: true,
          },
          legend: { top: 0, type: 'scroll', data: averages.map((a) => a.name) },
          xAxis: { type: 'category', data: candles.map((c) => c.date), axisLabel: { hideOverlap: true } },
          yAxis: {
            type: 'value', name: '点', nameGap: 16, scale: true, axisLabel: { formatter: (v: number) => numberText(v) },
          },
          series: [{
            type: 'candlestick',
            name: index?.name,
            itemStyle: {
              color: quoteColors.up, color0: quoteColors.down, borderColor: quoteColors.up, borderColor0: quoteColors.down,
            },
            data: candles.map((c) => c.value || ['-', '-', '-', '-']),
            markArea: {
              silent: true,
              label: { show: false },
              data: gaps.map((gap) => [{
                name: `${gap.direction === 'up' ? '向上' : '向下'}缺口`,
                xAxis: gap.start < candles[0].date ? candles[0].date : gap.start,
                yAxis: gap.low,
                itemStyle: {
                  color: withAlpha(quoteColors[gap.direction], 0.1), borderColor: quoteColors[gap.direction], borderWidth: 1, borderType: 'dashed',
                },
              }, { xAxis: candles[candles.length - 1].date, yAxis: gap.high }]),
            },
          }, ...averages.map((a, i) => ({
            type: 'line' as const,
            name: a.name,
            data: a.values,
            showSymbol: false,
            connectNulls: false,
            lineStyle: { width: 1.25, color: movingAverageColors[i] },
            itemStyle: { color: movingAverageColors[i] },
          }))],
        })}
        />
      )}
    </Card>
  );
}
export default memo(IndexChart);
