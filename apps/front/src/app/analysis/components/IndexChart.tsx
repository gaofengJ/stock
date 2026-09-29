'use client';

import { useState } from 'react';
import {
  Card, Empty, Segmented, Select,
} from 'antd';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { MarketSeries } from '@/api/market';
import { numberText } from '@/utils/format';
import { CandlePeriod, indexCandles } from './market-display';

export default function IndexChart({ index, dates }: { index: MarketSeries['indexes'][number] | undefined; dates: string[] }) {
  const [period, setPeriod] = useState<CandlePeriod>('day');
  const [count, setCount] = useState(60);
  const all = indexCandles(index?.series || [], dates, period);
  const candles = count === 0 ? all : all.slice(-count);
  const periodName = { day: '个交易日', week: '周', month: '月' }[period];
  const ranges = { day: [20, 60, 120, 0], week: [12, 26, 52, 0], month: [6, 12, 0] }[period];
  return (
    <Card
      className="market-chart market-index-chart"
      title={(
        <span className="market-section-title">
          {`${index?.name || '指数'} - 指数走势`}
          <HelpTooltip label="指数走势" title="日K使用真实开高低收；周K、月K按日线汇总，首尾周期可能尚未完整。最多展示所选日期前两年的已发布数据；缺失日线的周期留空。红涨绿跌按收盘与开盘比较。" />
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
              return candle.value ? `${date}\n开盘  ${numberText(candle.value[0])} 点\n收盘  ${numberText(candle.value[1])} 点\n最高  ${numberText(candle.value[3])} 点\n最低  ${numberText(candle.value[2])} 点` : `${date}\n数据不完整`;
            },
          },
          grid: {
            left: 16, right: 20, top: 40, bottom: 24, containLabel: true,
          },
          xAxis: { type: 'category', data: candles.map((c) => c.date), axisLabel: { hideOverlap: true } },
          yAxis: {
            type: 'value', name: '点', nameGap: 16, scale: true, axisLabel: { formatter: (v: number) => numberText(v) },
          },
          series: [{
            type: 'candlestick',
            name: index?.name,
            itemStyle: {
              color: '#d92d53', color0: '#16835b', borderColor: '#d92d53', borderColor0: '#16835b',
            },
            data: candles.map((c) => c.value || ['-', '-', '-', '-']),
          }],
        })}
        />
      )}
    </Card>
  );
}
