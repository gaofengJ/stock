'use client';

import { memo, useId, useState } from 'react';
import {
  Button, Card, Col, Modal, Row,
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
  ChartWindow, pairedIndexCandles, movingAverage, averagePeriods, unfilledGaps,
} from './market-display';

function IndexChart({ index, dates, window }: { index: MarketSeries['indexes'][number]; dates: string[]; window: ChartWindow }) {
  const { mode, colors } = useSiteTheme();
  const panel = mode === 'dark' ? candlePanelColors : {
    text: colors.secondary, muted: colors.muted, axis: chartColors.axis, selection: chartColors.grid,
  };
  const averagesPalette = mode === 'dark' ? movingAverageColors : lightMovingAverageColors;
  const groupId = useId();
  const [expanded, setExpanded] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const { period, count } = window;
  const candles = pairedIndexCandles(index.series, dates, period);
  const dateLabels = new Map(candles.map((c, i) => [c.date, !i || candles[i - 1].date.slice(0, 4) !== c.date.slice(0, 4) ? c.date.slice(0, 7) : c.date.slice(5)]));
  const averages = averagePeriods.map((n) => ({ name: `MA${n}`, values: movingAverage(candles, n) }));
  const gaps = unfilledGaps(candles);
  const renderChart = (height: number, volume: boolean, view: string) => (
    <CChart
      key={`${index.code}-${period}-${count}-${dates.at(-1)}-${resetKey}-${volume}`}
      group={`${groupId}-${view}-${period}-${count}-${resetKey}`}
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
            if (!candle.value || candle.volume == null) return `${date}\n行情数据不完整`;
            if (volume) return `${date}\n成交量  ${numberText(candle.volume)} 万手`;
            const values = Array.isArray(params) ? params : [params];
            const lines = values.filter((p: any) => p.seriesType === 'line').map((p: any) => `${p.seriesName}  ${numberText(p.value)}`).join('\n');
            return `${date}\n开盘  ${numberText(candle.value[0])}\n收盘  ${numberText(candle.value[1])}\n最高  ${numberText(candle.value[3])}\n最低  ${numberText(candle.value[2])}${lines ? `\n${lines}` : ''}\n成交量  ${numberText(candle.volume)} 万手`;
          },
        },
        axisPointer: { label: { backgroundColor: panel.selection, color: panel.text } },
        dataZoom: [{
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'filter',
          startValue: count ? Math.max(0, candles.length - count) : 0,
          endValue: candles.length - 1,
          zoomOnMouseWheel: 'ctrl',
          moveOnMouseMove: true,
          preventDefaultMouseMove: false,
        }, {
          type: 'slider',
          xAxisIndex: 0,
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
        grid: {
          left: 64, right: 20, top: 56, bottom: 72,
        },
        legend: {
          top: 8, left: volume ? 'center' : 8, right: volume ? undefined : 8, type: 'scroll', pageIconColor: panel.text, pageTextStyle: { color: panel.text }, data: volume ? ['成交量'] : averages.map((a) => a.name),
        },
        xAxis: {
          type: 'category', data: candles.map((c) => c.date), axisLabel: { hideOverlap: true, formatter: (date: string) => (period === 'month' ? date.slice(0, 7) : dateLabels.get(date) || date) },
        },
        yAxis: volume ? {
          type: 'value', name: '万手', nameGap: 16, axisLabel: { formatter: (v: number) => numberText(v, v > 0 && v < 1 ? 2 : 0) },
        } : {
          type: 'value', scale: true, axisLabel: { formatter: (v: number) => numberText(v) },
        },
        series: volume ? [{
          type: 'bar',
          name: '成交量',
          barMaxWidth: 16,
          itemStyle: { color: quoteColors.up },
          data: candles.map((c) => ({
            value: c.volume,
            itemStyle: { color: !c.value || c.value[0] === c.value[1] ? colors.secondary : quoteColors[c.value[1] > c.value[0] ? 'up' : 'down'] },
          })),
        }] : [{
          type: 'candlestick',
          name: index.name,
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
        }))],
      })}
    />
  );
  const renderPair = (height: number, view: string) => (
    <Row gutter={[16, 16]} className="market-index-pair" data-index-code={index.code}>
      <Col xs={24} lg={12}>
        <Card
          className="market-chart market-index-chart"
          title={(
            <span className="market-section-title">
              {index.name}
              <HelpTooltip label="指数走势" title="拖动日期条或按住Ctrl滚轮缩放，成交量同步。虚线框为未回补缺口。" />
            </span>
          )}
          extra={view === 'normal' && (
            <div className="market-chart-actions">
              <Button size="small" icon={<ReloadOutlined />} onClick={() => setResetKey((v) => v + 1)} aria-label={`重置${index.name}日期范围`}>重置</Button>
              <Button size="small" icon={<ExpandOutlined />} onClick={() => setExpanded(true)} aria-label={`放大查看${index.name}`}>放大</Button>
            </div>
          )}
        >
          {renderChart(height, false, view)}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card
          className="market-chart market-index-volume-chart"
          title={(
            <span className="market-section-title">
              {`${index.name} - 成交量`}
              <HelpTooltip label={`${index.name}成交量`} title="该指数的成交量，周/月为周期合计；缩放与左侧K线同步。" />
            </span>
          )}
        >
          {renderChart(height, true, view)}
        </Card>
      </Col>
    </Row>
  );
  return (
    <>
      {renderPair(400, 'normal')}
      <Modal title={index.name} open={expanded} onCancel={() => setExpanded(false)} footer={<Button icon={<ReloadOutlined />} onClick={() => setResetKey((v) => v + 1)}>重置日期范围</Button>} width={1800} style={{ maxWidth: 'calc(100vw - 24px)' }} destroyOnClose>
        {expanded && renderPair(560, 'expanded')}
      </Modal>
    </>
  );
}
export default memo(IndexChart);
