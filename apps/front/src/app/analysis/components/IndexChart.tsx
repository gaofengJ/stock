'use client';

import { memo } from 'react';
import { Card, Empty } from 'antd';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { MarketSeries } from '@/api/market';
import { numberText } from '@/utils/format';
import { movingAverageColors, quoteColors, withAlpha } from '@/colors';
import {
  ChartWindow, indexCandles, movingAverage, averagePeriods, unfilledGaps,
} from './market-display';

function IndexChart({ index, dates, window }: { index: MarketSeries['indexes'][number]; dates: string[]; window: ChartWindow }) {
  const { period, count } = window;
  const all = indexCandles(index?.series || [], dates, period);
  const candles = count === 0 ? all : all.slice(-count);
  const offset = all.length - candles.length;
  const averages = averagePeriods.map((n) => ({ name: `MA${n}`, values: movingAverage(all, n).slice(offset) }));
  const gaps = unfilledGaps(all);
  return (
    <Card
      className="market-chart market-index-chart"
      title={(
        <span className="market-section-title">
          {index?.name || '指数'}
          <HelpTooltip label="指数走势" title="MA为当前周期收盘均线（日K为日均线，周/月K为周/月均线），点击图例可开关；不足周期留空。色带标出截至所选日期未回补的跳空缺口，部分回补后仅保留剩余区间。周/月K由日线汇总，首尾周期可能不完整，下方为对应周期成交量，周/月成交量按日线求和；最多展示两年数据。" />
        </span>
      )}
    >
      {!candles.some((c) => c.value || c.volume != null) ? <Empty description="该范围暂无完整行情数据" /> : (
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
              const lines = values.filter((p: any) => p.seriesType === 'line').map((p: any) => `${p.seriesName}  ${numberText(p.value)}`).join('\n');
              return candle.value ? `${date}\n开盘  ${numberText(candle.value[0])}\n收盘  ${numberText(candle.value[1])}\n最高  ${numberText(candle.value[3])}\n最低  ${numberText(candle.value[2])}\n成交量  ${numberText(candle.volume)} 万手${lines ? `\n${lines}` : ''}` : `${date}\n价格数据不完整\n成交量  ${numberText(candle.volume)} 万手`;
            },
          },
          axisPointer: { link: [{ xAxisIndex: 'all' }] },
          grid: [
            {
              left: 64, right: 20, top: 42, height: 184,
            },
            {
              left: 64, right: 20, top: 270, height: 56,
            },
          ],
          legend: { top: 0, type: 'scroll', data: averages.map((a) => a.name) },
          xAxis: [
            {
              type: 'category', data: candles.map((c) => c.date), gridIndex: 0, axisLabel: { show: false }, axisTick: { show: false },
            },
            {
              type: 'category', data: candles.map((c) => c.date), gridIndex: 1, axisLabel: { hideOverlap: true },
            },
          ],
          yAxis: [
            {
              type: 'value', gridIndex: 0, scale: true, axisLabel: { formatter: (v: number) => numberText(v) },
            },
            {
              type: 'value', gridIndex: 1, name: '成交量（万手）', nameGap: 12, splitNumber: 2, axisLabel: { formatter: (v: number) => numberText(v, v > 0 && v < 1 ? 2 : 0) },
            },
          ],
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
          })), {
            type: 'bar',
            name: '成交量',
            xAxisIndex: 1,
            yAxisIndex: 1,
            barMaxWidth: 16,
            data: candles.map((c) => ({
              value: c.volume,
              itemStyle: { color: !c.value || c.value[0] === c.value[1] ? quoteColors.flat : quoteColors[c.value[1] > c.value[0] ? 'up' : 'down'] },
            })),
          }],
        })}
        />
      )}
    </Card>
  );
}
export default memo(IndexChart);
