'use client';

import { memo, useState } from 'react';
import {
  Button, Card, Empty, Modal,
} from 'antd';
import { ExpandOutlined, ReloadOutlined } from '@ant-design/icons';
import CChart from '@/components/CChart';
import { useSiteTheme } from '@/components/SiteTheme';
import HelpTooltip from '@/components/HelpTooltip';
import { MarketSeries } from '@/api/market';
import { numberText } from '@/utils/format';
import {
  movingAverageColors, lightMovingAverageColors, quoteColors, withAlpha, candlePanelColors, chartColors,
} from '@/colors';
import {
  ChartWindow, indexCandles, movingAverage, averagePeriods, unfilledGaps,
} from './market-display';

function IndexChart({ index, dates, window }: { index: MarketSeries['indexes'][number]; dates: string[]; window: ChartWindow }) {
  const { mode, colors } = useSiteTheme();
  const panel = mode === 'dark' ? candlePanelColors : {
    text: colors.secondary, muted: colors.muted, axis: chartColors.axis, selection: chartColors.grid,
  };
  const averagesPalette = mode === 'dark' ? movingAverageColors : lightMovingAverageColors;
  const [expanded, setExpanded] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const { period, count } = window;
  const all = indexCandles(index?.series || [], dates, period);
  const candles = all;
  const dateLabels = new Map(candles.map((c, i) => [c.date, !i || candles[i - 1].date.slice(0, 4) !== c.date.slice(0, 4) ? c.date.slice(0, 7) : c.date.slice(5)]));
  const averages = averagePeriods.map((n) => ({ name: `MA${n}`, values: movingAverage(all, n) }));
  const gaps = unfilledGaps(all);
  const renderChart = (height: number) => (
    !candles.some((c) => c.value || c.volume != null) ? <Empty description="该范围暂无完整行情数据" /> : (
      <CChart
        key={`${index.code}-${period}-${count}-${dates.at(-1)}-${resetKey}`}
        height={height}
        genOptions={() => ({
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
          axisPointer: { link: [{ xAxisIndex: 'all' }], label: { backgroundColor: panel.selection, color: panel.text } },
          dataZoom: [{
            type: 'inside',
            xAxisIndex: [0, 1],
            filterMode: 'filter',
            startValue: count ? Math.max(0, candles.length - count) : 0,
            endValue: candles.length - 1,
            zoomOnMouseWheel: 'ctrl',
            moveOnMouseMove: true,
            preventDefaultMouseMove: false,
          }, {
            type: 'slider',
            xAxisIndex: [0, 1],
            filterMode: 'filter',
            bottom: 8,
            height: 20,
            left: 64,
            right: 20,
            startValue: count ? Math.max(0, candles.length - count) : 0,
            endValue: candles.length - 1,
            borderColor: panel.axis,
            fillerColor: withAlpha(panel.text, 0.15),
            handleStyle: { color: panel.text },
            textStyle: { color: panel.text },
            dataBackground: { lineStyle: { color: panel.muted }, areaStyle: { color: panel.selection } },
            selectedDataBackground: { lineStyle: { color: panel.text }, areaStyle: { color: panel.selection } },
          }],
          grid: [
            {
              left: 64, right: 20, top: 44, height: height * 0.48,
            },
            {
              left: 64, right: 20, top: height * 0.69, height: height * 0.14,
            },
          ],
          legend: {
            top: 8, left: 8, right: 8, type: 'scroll', pageIconColor: panel.text, pageTextStyle: { color: panel.text }, data: averages.map((a) => a.name),
          },
          xAxis: [
            {
              type: 'category', data: candles.map((c) => c.date), gridIndex: 0, axisLabel: { show: false }, axisTick: { show: false },
            },
            {
              type: 'category', data: candles.map((c) => c.date), gridIndex: 1, axisLabel: { hideOverlap: true, formatter: (date: string) => (period === 'month' ? date.slice(0, 7) : dateLabels.get(date) || date) },
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
            lineStyle: { width: 1.25, color: averagesPalette[i] },
            itemStyle: { color: averagesPalette[i] },
          })), {
            type: 'bar',
            name: '成交量',
            xAxisIndex: 1,
            yAxisIndex: 1,
            barMaxWidth: 16,
            data: candles.map((c) => ({
              value: c.volume,
              itemStyle: { color: !c.value || c.value[0] === c.value[1] ? colors.secondary : quoteColors[c.value[1] > c.value[0] ? 'up' : 'down'] },
            })),
          }],
        })}
      />
    )
  );
  return (
    <>
      <Card
        className="market-chart market-index-chart"
        title={(
          <span className="market-section-title">
            {index?.name || '指数'}
            <HelpTooltip label="指数走势" title="拖动底部日期条或按住Ctrl滚轮缩放，右上角可重置或放大查看。均线随周期计算，成交量按周期求和；缺口显示所选交易日尚未回补的区间，首尾周/月可能不完整，最多两年数据。" />
          </span>
      )}
        extra={(
          <div className="market-chart-actions">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => setResetKey((v) => v + 1)} aria-label={`重置${index.name}日期范围`}>重置</Button>
            <Button size="small" icon={<ExpandOutlined />} onClick={() => setExpanded(true)} aria-label={`放大查看${index.name}`}>放大</Button>
          </div>
        )}
      >
        {renderChart(400)}
      </Card>
      <Modal title={index.name} open={expanded} onCancel={() => setExpanded(false)} footer={<Button icon={<ReloadOutlined />} onClick={() => setResetKey((v) => v + 1)}>重置日期范围</Button>} width={1400} style={{ maxWidth: 'calc(100vw - 24px)' }} destroyOnClose>
        {expanded && renderChart(560)}
      </Modal>
    </>
  );
}
export default memo(IndexChart);
