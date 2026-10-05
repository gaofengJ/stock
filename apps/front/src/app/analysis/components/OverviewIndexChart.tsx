'use client';

import {
  memo, useCallback, useEffect, useRef, useState,
} from 'react';
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
  quoteColors, withAlpha, candlePanelColors, chartColors,
} from '@/colors';
import {
  ChartWindow, pairedIndexCandles, movingAverage, averagePeriods, unfilledGaps,
} from './market-display';
import IndexQuotePanel, { QuotePanelHandle } from './IndexQuotePanel';

function ExpandedChart({ render }: { render: (height: number) => React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(560);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const update = () => setHeight(Math.max(160, container.clientHeight));
    const observer = new ResizeObserver(update);
    observer.observe(container);
    update();
    return () => observer.disconnect();
  }, []);
  return <div ref={containerRef} className="market-expanded-chart">{render(height)}</div>;
}

function OverviewIndexChart({ index, dates, window }: { index: MarketSeries['indexes'][number]; dates: string[]; window: ChartWindow }) {
  const { mode, colors } = useSiteTheme();
  const panel = mode === 'dark' ? candlePanelColors : {
    text: colors.secondary, muted: colors.muted, axis: chartColors.axis, selection: chartColors.grid,
  };
  const averagesPalette = mode === 'dark'
    ? ['#eeeeee', '#ffff00', '#ff40ff', '#35df35', '#00dddd', '#eeeeaa', '#329999']
    : ['#697386', '#a88000', '#bd26b8', '#258225', '#008c99', '#927534', '#247a78'];
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);
  const [resetKey, setResetKey] = useState(0);
  const quoteRef = useRef<QuotePanelHandle>(null);
  const expandedQuoteRef = useRef<QuotePanelHandle>(null);
  const onAxisHover = useCallback((date: string) => {
    quoteRef.current?.select(date);
    expandedQuoteRef.current?.select(date);
  }, []);
  const { period, count } = window;
  const all = pairedIndexCandles(index?.series || [], dates, period);
  const candles = all;
  const dateLabels = new Map(candles.map((c, i) => [c.date, !i || candles[i - 1].date.slice(0, 4) !== c.date.slice(0, 4) ? c.date.slice(0, 7) : c.date.slice(5)]));
  const averages = averagePeriods.map((n) => ({ name: `MA${n}`, values: movingAverage(all, n) }));
  const gaps = unfilledGaps(all);
  const renderChart = (height: number, full = false) => (
    !candles.some((c) => c.value || c.volume != null) ? <Empty description="该范围暂无完整行情数据" /> : (
      <IndexQuotePanel key={`${index.code}-${period}-${count}-${dates.at(-1)}-${resetKey}`} ref={full ? expandedQuoteRef : quoteRef} name={index.name} candles={candles} points={index.series} averages={averages} palette={averagesPalette}>
        <CChart
          key={`${index.code}-${period}-${count}-${dates.at(-1)}-${resetKey}`}
          height={Math.max(200, height - 70)}
          onAxisHover={onAxisHover}
          genOptions={() => ({
            tooltip: {
              trigger: 'axis',
              showContent: false,
              axisPointer: { type: 'cross' },
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
                left: 56, right: 24, top: 36, height: Math.max(60, height - 226) * 0.72,
              },
              {
                left: 56, right: 24, top: 76 + Math.max(60, height - 226) * 0.72, height: Math.max(60, height - 226) * 0.28,
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
                type: 'category', data: candles.map((c) => c.date), gridIndex: 1, axisTick: { alignWithLabel: true }, axisLabel: { hideOverlap: true, formatter: (date: string) => (period === 'month' ? date.slice(0, 7) : dateLabels.get(date) || date) },
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
                color: 'transparent', color0: quoteColors.down, borderColor: quoteColors.up, borderColor0: quoteColors.down,
              },
              data: candles.map((c) => c.value || ['-', '-', '-', '-']),
              markLine: {
                silent: true,
                symbol: 'none',
                label: { show: false },
                data: gaps.flatMap((gap) => [gap.low, gap.high].map((boundary) => [{
                  name: `${gap.direction === 'up' ? '向上' : '向下'}缺口`,
                  coord: [gap.start < candles[0].date ? candles[0].date : gap.start, boundary],
                  lineStyle: { color: withAlpha(quoteColors[gap.direction], 0.35), width: 1, type: 'dashed' },
                }, { coord: [candles[candles.length - 1].date, boundary] }])),
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
              itemStyle: { color: quoteColors.up },
              data: candles.map((c) => ({
                value: c.volume,
                itemStyle: { color: !c.value || c.value[0] === c.value[1] ? colors.secondary : quoteColors[c.value[1] > c.value[0] ? 'up' : 'down'] },
              })),
            }],
          })}
        />
      </IndexQuotePanel>
    )
  );
  return (
    <>
      <Card
        className="market-chart market-index-chart market-overview-index"
        title={(
          <span className="market-section-title">
            {index?.name || '指数'}
            <HelpTooltip label="指数走势" title="顶部均线数值与左侧行情跟随十字光标，默认显示最新交易日。上方K线、下方成交量，共用日期与缩放。淡色虚线为未回补缺口边界。" />
          </span>
      )}
        extra={(
          <div className="market-chart-actions">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => setResetKey((v) => v + 1)} aria-label={`重置${index.name}日期范围`}>重置</Button>
            <Button size="small" icon={<ExpandOutlined />} onClick={() => setExpanded(true)} aria-label={`放大查看${index.name}`}>放大</Button>
          </div>
        )}
      >
        {renderChart(510)}
      </Card>
      <Modal
        className="market-index-modal"
        title={index.name}
        open={expanded}
        keyboard
        onCancel={() => setExpanded(false)}
        footer={<Button icon={<ReloadOutlined />} onClick={() => setResetKey((v) => v + 1)}>重置日期范围</Button>}
        width="calc(100vw - 32px)"
        style={{
          top: 16, margin: '0 auto', maxWidth: 'calc(100vw - 32px)', paddingBottom: 0,
        }}
        destroyOnClose
      >
        {expanded && <ExpandedChart render={(height) => renderChart(height, true)} />}
      </Modal>
    </>
  );
}
export default memo(OverviewIndexChart);
