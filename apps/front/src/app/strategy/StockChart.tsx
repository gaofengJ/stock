'use client';

import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Button, Empty, Modal,
} from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import CChart from '@/components/CChart';
import candleExtremaMarks from '@/components/CChart/candle-extrema';
import Loading from '@/components/Loading';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useSiteTheme } from '@/components/SiteTheme';
import { lightMovingAverageColors, movingAverageColors, quoteColors } from '@/colors';
import { movingAverage } from '@/app/analysis/components/market-display';
import ExpandedChart from '@/app/analysis/components/ExpandedChart';
import StockQuotePanel, { StockPoint, StockQuoteHandle } from './StockQuotePanel';
import { hoverAverageLabel } from '../analysis/components/overview-chart';
import type { TrendOptions } from './TrendParameters';
import {
  initialChartRange, shiftedChartRange, pagedChartRange, ChartRange,
} from './chart-navigation';
import './stock-chart.css';

interface StockChartData {
  code: string; date: string; basis: string;
  series: StockPoint[];
  evidence: { breakoutPrice?: number; breakoutDate?: string } | null;
  latestDate?: string; hasEarlier?: boolean; hasLater?: boolean;
}
const periods = [5, 10, 20, 60, 120];

export default function StockChart({
  stock, date, strategy, options, onClose, neutral = false, navigation = [], onNavigate,
}: {
  stock: any; date: string; strategy: string; options: TrendOptions; onClose: () => void; neutral?: boolean; navigation?: any[]; onNavigate?: (stock: any) => void;
}) {
  const [data, setData] = useState<StockChartData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reset, setReset] = useState(0);
  const [range, setRange] = useState<ChartRange>({ start: 0, end: 0 });
  const [view, setView] = useState<{ identity: string; mode: string; anchor?: string; page?: { data: StockChartData; range: ChartRange; direction: number } } | null>(null);
  const { mode, colors } = useSiteTheme();
  const instance = useId();
  const { requestConfig, runLatestRequest } = useLatestRequest(`strategy-stock-chart-${instance}`);
  const quoteRef = useRef<StockQuoteHandle>(null);
  const onAxisHover = useCallback((hoverDate: string | null) => quoteRef.current?.select(hoverDate), []);
  const code = stock?.tsCode;
  const optionKey = JSON.stringify(options);
  const queryOptions = useMemo(() => JSON.parse(optionKey) as TrendOptions, [optionKey]);
  const identity = `${code}-${date}-${strategy}-${optionKey}`;
  const viewMode = view?.identity === identity ? view.mode : 'signal';
  const anchor = view?.identity === identity ? view.anchor : undefined;
  const page = view?.identity === identity ? view.page : undefined;
  const position = navigation.findIndex((row) => row.tsCode === code && (!stock?.date || row.date === stock.date));
  useEffect(() => { setView(null); }, [identity]);
  useEffect(() => {
    if (!code) { request.cancelRace(requestConfig.raceKey!); return; }
    runLatestRequest({
      request: () => request.get<StockChartData>('/strategy/chart', {
        ...requestConfig,
        params: {
          date,
          code,
          strategyType: strategy,
          ...queryOptions,
          ...(viewMode === 'signal' ? { chartAroundSignal: true } : {}),
          ...(viewMode === 'latest' ? { chartLatest: true } : {}),
          ...(viewMode === 'before' ? { chartBefore: anchor } : {}),
          ...(viewMode === 'after' ? { chartAfter: anchor } : {}),
        },
        timeout: 30000,
      }),
      onStart: () => { setLoading(true); setError(''); setData(null); quoteRef.current?.select(null); },
      onSuccess: (response) => {
        if (page) {
          const merged = pagedChartRange(page.data.series, response.data.series, page.range, page.direction);
          setData({
            ...response.data,
            series: merged.series,
            hasEarlier: merged.clippedEarlier || (page.direction < 0 ? response.data.hasEarlier : page.data.hasEarlier),
            hasLater: merged.clippedLater || (page.direction > 0 ? response.data.hasLater : page.data.hasLater),
          });
          setRange(merged.range);
        } else {
          setData(response.data);
          setRange(initialChartRange(response.data.series.map((row) => row.date), date, viewMode, anchor));
        }
        setReset((v) => v + 1);
      },
      onError: (e) => setError(errorMessage(e, 'K线加载失败')),
      onFinally: () => setLoading(false),
    });
  }, [code, date, strategy, queryOptions, viewMode, anchor, page, attempt, requestConfig, runLatestRequest]);
  const onZoomChange = useCallback((start: number, end: number) => {
    const last = (data?.series.length || 1) - 1;
    const next = { start: Math.round((start * last) / 100), end: Math.round((end * last) / 100) };
    setRange((current) => (current.start === next.start && current.end === next.end ? current : next));
  }, [data]);
  const moveTime = (direction: number) => {
    if (!data?.series.length || loading) return;
    const edge = direction < 0 ? range.start <= 120 && data.hasEarlier : range.end === data.series.length - 1;
    if (edge) {
      setView({
        identity, mode: direction < 0 ? 'before' : 'after', anchor: data.series[direction < 0 ? range.start : range.end].date, page: { data, range, direction },
      });
    } else {
      setRange(shiftedChartRange(range, data.series.length, direction));
      quoteRef.current?.select(null);
    }
  };
  const focusTime = (modeName: 'signal' | 'latest') => {
    const dates = data?.series.map((row) => row.date) || [];
    const within = modeName === 'signal' ? dates.includes(date) : dates.at(-1) === data?.latestDate;
    if (within) {
      setRange(initialChartRange(dates, date, modeName));
    } else setView({ identity, mode: modeName });
  };
  const candles = (data?.series || []).map((row) => ({
    date: row.date,
    start: row.date,
    end: row.date,
    value: row.open == null || row.close == null || row.low == null || row.high == null ? null : [row.open, row.close, row.low, row.high] as [number, number, number, number],
  }));
  const palette = mode === 'dark' ? movingAverageColors : lightMovingAverageColors;
  const lineColors = [palette[0], palette[1], palette[2], palette[4], palette[5]];
  const ma = periods.map((period) => movingAverage(candles, period));
  const markerLines: any[] = [{ name: neutral ? '观察日' : '信号日', xAxis: date, label: { formatter: neutral ? '观察日' : '信号日', position: 'insideEndTop' } }];
  if (!neutral && data?.evidence?.breakoutPrice != null) markerLines.push({ name: '突破位', yAxis: data.evidence.breakoutPrice, label: { formatter: '突破位 {c}', position: 'insideEndTop' } });
  if (!neutral && data?.evidence?.breakoutDate) markerLines.push({ name: '突破日', xAxis: data.evidence.breakoutDate, label: { formatter: '突破日', position: 'insideEndTop' } });
  return (
    <Modal
      className="strategy-stock-modal"
      wrapClassName="strategy-stock-modal-wrap"
      open={!!stock}
      title={(
        <div className="strategy-chart-title">
          <span>{[stock?.name, code, neutral ? '日K' : '信号形态'].filter(Boolean).join(' · ')}</span>
          {onNavigate && navigation.length > 1 && (
            <span className="strategy-chart-stock-navigation">
              <Button size="small" aria-label="上一只股票" title="上一只股票" icon={<LeftOutlined />} disabled={position <= 0} onClick={() => onNavigate(navigation[position - 1])} />
              <span className="strategy-chart-position" aria-live="polite">
                {position + 1}
                {' '}
                /
                {' '}
                {navigation.length}
              </span>
              <Button size="small" aria-label="下一只股票" title="下一只股票" icon={<RightOutlined />} disabled={position < 0 || position >= navigation.length - 1} onClick={() => onNavigate(navigation[position + 1])} />
            </span>
          )}
        </div>
    )}
      onCancel={onClose}
      footer={null}
      width="calc(100vw - 32px)"
      style={{
        top: 16, margin: '0 auto', maxWidth: 'calc(100vw - 32px)', paddingBottom: 0,
      }}
      destroyOnClose
      keyboard
    >
      <div className="strategy-chart-summary">
        <span>
          {neutral ? '观察日期' : '信号日期'}
          {' '}
          {date}
        </span>
        {data && (
        <span>
          {data.basis}
          价格
        </span>
        )}
        <Button size="small" disabled={loading || !data} onClick={() => focusTime('signal')}>{neutral ? '回到观察日' : '回到信号日'}</Button>
        <Button size="small" disabled={loading || !data} onClick={() => focusTime('latest')}>查看最新</Button>
        <span className="strategy-chart-visible-range" aria-live="polite">
          {data && !loading ? `${data.series[range.start]?.date || ''} ～ ${data.series[range.end]?.date || ''}` : '正在加载行情'}
        </span>
        <span>两侧箭头每次移动1个交易日，拖动下方滑块缩放；高低点随范围更新，悬停查看行情</span>
      </div>
      <div className="strategy-chart-stage has-navigation">
        <Button className="strategy-chart-nav strategy-chart-prev" aria-label="查看更早K线" title="查看更早K线" icon={<LeftOutlined />} disabled={loading || !data || (!range.start && !data.hasEarlier)} onClick={() => moveTime(-1)} />
        <Button className="strategy-chart-nav strategy-chart-next" aria-label="查看更新K线" title="查看更新K线" icon={<RightOutlined />} disabled={loading || !data || (range.end === data.series.length - 1 && !data.hasLater)} onClick={() => moveTime(1)} />
        {!!stock && (
        <ExpandedChart render={(height) => (
          <>
            {loading && <Loading height={height} />}
            {!loading && error && <Alert type="error" message={error} action={<Button onClick={() => setAttempt((v) => v + 1)}>重试</Button>} />}
            {!loading && !error && !candles.some((c) => c.value) && <Empty description="暂无可用行情" />}
            {!loading && !error && candles.some((c) => c.value) && (
            <StockQuotePanel key={`${code}-${date}`} ref={quoteRef} series={data?.series || []} basis={data?.basis || ''}>
              <CChart
                key={`${code}-${date}-${reset}`}
                height={height}
                onAxisHover={onAxisHover}
                onZoomChange={onZoomChange}
                formatHoverLegend={(name, hoverDate) => hoverAverageLabel(name, hoverDate, candles, periods.map((n, i) => ({ name: `MA${n}`, values: ma[i] })))}
                genOptions={() => ({
                  animation: false,
                  legend: { type: 'scroll', top: 4, data: periods.map((n) => `MA${n}`) },
                  tooltip: {
                    trigger: 'axis',
                    showContent: false,
                    axisPointer: { type: 'cross' },
                  },
                  axisPointer: { link: [{ xAxisIndex: 'all' }] },
                  grid: [{
                    left: 76, right: 44, top: height < 360 ? 44 : 60, height: height < 360 ? '42%' : '55%',
                  }, {
                    left: 76, right: 44, top: '73%', height: '14%',
                  }],
                  xAxis: [
                    {
                      type: 'category', data: candles.map((c) => c.date), axisLabel: { show: false }, axisTick: { alignWithLabel: true },
                    },
                    {
                      type: 'category', gridIndex: 1, data: candles.map((c) => c.date), axisTick: { alignWithLabel: true }, axisLabel: { hideOverlap: true, formatter: (v: string) => v.slice(5) },
                    },
                  ],
                  yAxis: [{
                    scale: true, boundaryGap: ['12%', '12%'], name: `${data?.basis}（元）`, splitNumber: 5,
                  }, {
                    scale: true, min: 0, gridIndex: 1, name: '成交量（万手）', splitNumber: 2,
                  }],
                  dataZoom: [{
                    type: 'inside', xAxisIndex: [0, 1], startValue: range.start, endValue: range.end, zoomOnMouseWheel: 'ctrl',
                  },
                  {
                    type: 'slider', xAxisIndex: [0, 1], bottom: 0, height: 22, startValue: range.start, endValue: range.end,
                  }],
                  series: [
                    {
                      type: 'candlestick',
                      name: '日K',
                      markPoint: candleExtremaMarks(colors.text, colors.surfaceMuted),
                      data: candles.map((c) => c.value || ['-', '-', '-', '-']),
                      itemStyle: {
                        color: quoteColors.up, color0: quoteColors.down, borderColor: quoteColors.up, borderColor0: quoteColors.down,
                      },
                      markLine: {
                        silent: true, symbol: ['none', 'none'], lineStyle: { type: 'dashed', color: colors.secondary, opacity: 0.55 }, label: { color: colors.secondary }, data: markerLines,
                      },
                    },
                    ...periods.map((n, i) => ({
                      type: 'line' as const, name: `MA${n}`, data: ma[i], symbol: 'none', connectNulls: false, lineStyle: { width: 1, color: lineColors[i] }, itemStyle: { color: lineColors[i] },
                    })),
                    {
                      type: 'bar', name: '成交量', xAxisIndex: 1, yAxisIndex: 1, data: (data?.series || []).map((row) => ({ value: row.vol == null ? null : row.vol / 10000, itemStyle: { color: Number(row.close) >= Number(row.open) ? quoteColors.up : quoteColors.down } })),
                    },
                  ],
                })}
              />
            </StockQuotePanel>
            )}
          </>
        )}
        />
        )}
      </div>
    </Modal>
  );
}
