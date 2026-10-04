'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Empty, Modal, Space,
} from 'antd';
import request from '@/api/request';
import { errorMessage } from '@/api/errors';
import CChart from '@/components/CChart';
import Loading from '@/components/Loading';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useSiteTheme } from '@/components/SiteTheme';
import { lightMovingAverageColors, movingAverageColors, quoteColors } from '@/colors';
import { numberText, scaledNumber } from '@/utils/format';
import { movingAverage } from '@/app/analysis/components/market-display';
import type { TrendOptions } from './TrendParameters';

interface StockChartData {
  code: string; date: string; basis: string;
  series: { date: string; open: number | null; close: number | null; low: number | null; high: number | null; vol: number | null }[];
  evidence: { breakoutPrice?: number; breakoutDate?: string } | null;
}
const periods = [5, 10, 20, 60, 120];

export default function StockChart({
  stock, date, strategy, options, onClose, neutral = false,
}: {
  stock: any; date: string; strategy: string; options: TrendOptions; onClose: () => void; neutral?: boolean;
}) {
  const [data, setData] = useState<StockChartData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reset, setReset] = useState(0);
  const [height, setHeight] = useState(520);
  const { mode, colors } = useSiteTheme();
  const { requestConfig, runLatestRequest } = useLatestRequest('strategy-stock-chart');
  const code = stock?.tsCode;
  useEffect(() => {
    const resize = () => setHeight(Math.max(280, window.innerHeight - 220));
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    if (!code) return;
    runLatestRequest({
      request: () => request.get<StockChartData>('/strategy/chart', {
        ...requestConfig,
        params: {
          date, code, strategyType: strategy, ...options,
        },
        timeout: 90000,
      }),
      onStart: () => { setLoading(true); setError(''); setData(null); },
      onSuccess: (response) => setData(response.data),
      onError: (e) => setError(errorMessage(e, 'K线加载失败')),
      onFinally: () => setLoading(false),
    });
  }, [code, date, strategy, options, attempt, requestConfig, runLatestRequest]);
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
    <Modal open={!!stock} title={`${stock?.name || ''} ${code || ''} - ${neutral ? '日K' : '信号形态'}`} onCancel={onClose} footer={null} width="calc(100vw - 48px)" style={{ top: 24, paddingBottom: 24 }} destroyOnClose keyboard>
      <div className="strategy-chart-summary">
        <span>
          {neutral ? '观察日期' : '信号日期'}
          {date}
        </span>
        <span>
          {data?.basis || '日K'}
          价格
        </span>
        <span>
          实际收盘
          {numberText(stock?.close)}
          {' '}
          元
        </span>
        <span>
          成交额
          {scaledNumber(stock?.amount, 100000)}
          {' '}
          亿元
        </span>
        <span>
          实际开
          {numberText(stock?.open)}
          {' '}
          / 高
          {numberText(stock?.high)}
          {' '}
          / 低
          {numberText(stock?.low)}
        </span>
        <Space>
          <Button size="small" onClick={() => setReset((v) => v + 1)}>重置缩放</Button>
          <span>拖动下方滑块缩放日期</span>
        </Space>
      </div>
      {loading && <Loading height={height} />}
      {!loading && error && <Alert type="error" message={error} action={<Button onClick={() => setAttempt((v) => v + 1)}>重试</Button>} />}
      {!loading && !error && !candles.some((c) => c.value) && <Empty description="暂无可用行情" />}
      {!loading && !error && candles.some((c) => c.value) && (
        <CChart
          key={`${code}-${date}-${reset}`}
          height={height}
          genOptions={() => ({
            animation: false,
            legend: { top: 4, data: periods.map((n) => `MA${n}`) },
            tooltip: {
              trigger: 'axis',
              renderMode: 'richText',
              axisPointer: { type: 'cross' },
              formatter: (params: any) => {
                const i = (Array.isArray(params) ? params[0] : params)?.dataIndex;
                const row = data?.series[i];
                if (!row) return '';
                return `${row.date}\n开盘 ${numberText(row.open)}  收盘 ${numberText(row.close)}\n最高 ${numberText(row.high)}  最低 ${numberText(row.low)}\n${periods.map((n, index) => `MA${n} ${numberText(ma[index][i])}`).join('\n')}\n成交量 ${scaledNumber(row.vol, 10000)} 万手`;
              },
            },
            axisPointer: { link: [{ xAxisIndex: 'all' }] },
            grid: [{
              left: 76, right: 28, top: 60, height: '55%',
            }, {
              left: 76, right: 28, top: '73%', height: '14%',
            }],
            xAxis: [
              {
                type: 'category', data: candles.map((c) => c.date), axisLabel: { show: false }, axisTick: { alignWithLabel: true },
              },
              {
                type: 'category', gridIndex: 1, data: candles.map((c) => c.date), axisTick: { alignWithLabel: true }, axisLabel: { hideOverlap: true, formatter: (v: string) => v.slice(5) },
              },
            ],
            yAxis: [{ scale: true, name: `${data?.basis}（元）`, splitNumber: 5 }, {
              scale: true, min: 0, gridIndex: 1, name: '成交量（万手）', splitNumber: 2,
            }],
            dataZoom: [{
              type: 'inside', xAxisIndex: [0, 1], startValue: Math.max(0, candles.length - 60), endValue: candles.length - 1, zoomOnMouseWheel: 'ctrl',
            },
            {
              type: 'slider', xAxisIndex: [0, 1], bottom: 0, height: 22, startValue: Math.max(0, candles.length - 60), endValue: candles.length - 1,
            }],
            series: [
              {
                type: 'candlestick',
                name: '日K',
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
      )}
    </Modal>
  );
}
