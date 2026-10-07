'use client';

import {
  Alert, Button, Card, DatePicker, Empty, Select, Space,
} from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { marketRequest } from '@/api/market';
import type { IntradayCounts } from '@/api/intraday-counts';
import { errorMessage } from '@/api/errors';
import CChart from '@/components/CChart';
import { useSiteTheme } from '@/components/SiteTheme';
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingOverlay } from '@/components/Loading';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { numberText } from '@/utils/format';
import { chartColors, quoteColors } from '@/colors';
import {
  intradayCloses, intradayMean, intradayPhase, intradayPlot, intradayThresholds,
} from './intraday-counts-plot';
import './intraday-counts.css';

export default function IntradayCountsChart() {
  const [date, setDate] = useState('');
  const { colors } = useSiteTheme();
  const [days, setDays] = useState(10);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: IntradayCounts } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState('');
  const { requestConfig, runLatestRequest } = useLatestRequest('intraday-counts');
  const requestKey = JSON.stringify([date, days]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const refresh = (quiet = false) => runLatestRequest({
      request: () => marketRequest<IntradayCounts>('intraday-counts', {
        days, ...(date ? { date } : {}),
      }, requestConfig),
      onStart: () => { if (!quiet) setLoading(true); },
      onSuccess: (response) => { setResult({ key: requestKey, data: response.data }); setError(''); setLoadedKey(requestKey); },
      onError: (cause) => { setError(errorMessage(cause, '盘中上涨家数加载失败')); setLoadedKey(requestKey); },
      onFinally: () => setLoading(false),
    });
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(true); }, 60000);
    const onVisible = () => { if (!document.hidden) refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [date, days, attempt, requestKey, requestConfig, runLatestRequest]);

  const visible = result?.key === requestKey ? result.data : null;
  const rows = intradayPlot(visible?.points || [], visible?.dates || []);
  const latest = visible?.points.at(-1);
  const mean = intradayMean(rows, { 下跌家数: false });
  const phase = intradayPhase(latest?.up);
  const singleDay = new Set(rows.map((row) => row.date)).size <= 1;
  return (
    <Card
      title={(
        <span className="market-section-title">
          全市场盘中上涨家数
          <HelpTooltip label="盘中上涨家数" title="全市场含ST，每5分钟统计。观察阈值：≤1,000只为冰点，≥4,000只为沸点。圆点连接每日15:00的上涨家数；虚线为所选交易日内有效时点的均值，缺失数据保留断点。" />
        </span>
      )}
      className="market-chart market-intraday-card"
    >
      <div className="sentiment-chart-meta">
        <Space wrap>
          <DatePicker
            size="small"
            aria-label="盘中上涨家数截止日期"
            value={date ? dayjs(date) : null}
            placeholder="最新交易日"
            onChange={(value) => setDate(value?.format('YYYY-MM-DD') || '')}
            disabledDate={(value) => value.format('YYYY-MM-DD') > new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}
          />
          <Select
            size="small"
            aria-label="盘中上涨家数交易日范围"
            value={days}
            onChange={setDays}
            options={[1, 5, 10, 20, 30].map((value) => ({ value, label: value === 1 ? '最近1个交易日' : `近${value}个交易日` }))}
          />
        </Space>
        <p className="market-note">
          <span>固定全市场（含ST），不随页面筛选变化。</span>
          {latest && (
          <span className="intraday-latest">
            更新至
            {latest.date}
            {' '}
            {latest.time}
          </span>
          )}
        </p>
        <div className="intraday-summary">
          <span className="intraday-latest">
            最新上涨
            <strong>{numberText(latest?.up, 0)}</strong>
            {' '}
            只
          </span>
          {phase && <span className={`intraday-phase intraday-phase-${{ 沸点: 'hot', 冰点: 'cold', 常态: 'normal' }[phase]}`}>{phase}</span>}
          <span className="intraday-thresholds">
            <span className="intraday-hot">沸点 ≥4,000</span>
            <span>常态 1,001—3,999</span>
            <span className="intraday-cold">冰点 ≤1,000</span>
          </span>
        </div>
      </div>
      <div className="sentiment-chart-canvas">
        {error && loadedKey === requestKey && <Alert type="warning" showIcon message={error} description={visible?.points.length ? '以下为上次成功读取的记录。' : undefined} action={<Button size="small" onClick={retry}>重试</Button>} />}
        {loading && !visible && <LoadingOverlay />}
        {!loading && !error && !rows.length && <Empty description="暂无盘中记录，历史补齐或交易时段采集完成后将自动显示。" />}
        {rows.length > 0 && (
        <CChart
          height={300}
          genOptions={() => ({
            legend: {
              data: ['每日收盘'], top: 0, right: 12, selectedMode: false,
            },
            visualMap: {
              show: false,
              type: 'piecewise',
              seriesIndex: 0,
              dimension: 1,
              pieces: [
                { lte: intradayThresholds.ice, color: quoteColors.down },
                { gt: intradayThresholds.ice, lt: intradayThresholds.boiling, color: colors.text },
                { gte: intradayThresholds.boiling, color: quoteColors.up },
              ],
            },
            tooltip: {
              trigger: 'axis',
              renderMode: 'richText',
              formatter: (params: any) => {
                const item = (Array.isArray(params) ? params[0] : params);
                const row = rows.find((value) => value.label === item?.axisValue);
                if (!row?.time) return '';
                return [
                  `${row.date} ${row.time}`,
                  row.point ? `上涨：${numberText(row.point.up, 0)}只（${intradayPhase(row.point.up)}）` : '该时点未采集',
                  ...(row.time === '15:00' && row.point ? ['每日收盘'] : []),
                ].join('\n');
              },
            },
            grid: {
              left: 16, right: 20, top: 30, bottom: 58, containLabel: true,
            },
            xAxis: {
              type: 'category',
              data: rows.map((row) => row.label),
              boundaryGap: false,
              axisTick: { show: false },
              axisLabel: {
                hideOverlap: true,
                interval: singleDay ? 'auto' : (index: number) => rows[index].first,
                formatter: (_value: string, index: number) => (singleDay ? rows[index].time : rows[index].date.slice(5)),
              },
            },
            yAxis: {
              type: 'value',
              name: '只',
              minInterval: 1,
              min: 0,
              max: (value: { max: number }) => Math.max(5000, Math.ceil(value.max / 1000) * 1000),
              splitLine: { lineStyle: { type: 'dashed', opacity: 0.5 } },
            },
            dataZoom: [
              { type: 'inside', filterMode: 'none' },
              {
                type: 'slider', bottom: 5, height: 20, filterMode: 'none',
              },
            ],
            series: [{
              name: '上涨家数',
              type: 'line',
              showSymbol: rows.filter((row) => row.point).length === 1,
              symbolSize: 6,
              lineStyle: { width: 1.5 },
              connectNulls: false,
              itemStyle: { color: colors.text },
              data: rows.map((row) => [row.label, row.point?.up ?? null]),
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { type: 'dashed', color: chartColors.reference, width: 1 },
                label: {
                  position: 'insideEndTop',
                  formatter: '{b}',
                  color: colors.secondary,
                  backgroundColor: colors.surface,
                  padding: [2, 4],
                  borderRadius: 3,
                },
                data: [
                  ...rows.filter((row) => row.first).slice(1).map((row) => ({
                    xAxis: row.label, label: { show: false }, lineStyle: { opacity: 0.2 },
                  })),
                  {
                    yAxis: intradayThresholds.ice, name: '冰点 1,000', lineStyle: { color: quoteColors.down, opacity: 0.6 }, label: { position: 'insideStartTop', color: quoteColors.down },
                  },
                  {
                    yAxis: intradayThresholds.boiling, name: '沸点 4,000', lineStyle: { color: quoteColors.up, opacity: 0.6 }, label: { position: 'insideStartTop', color: quoteColors.up },
                  },
                  ...(mean ? [{ name: `时点均值 ${numberText(mean.value)}只`, yAxis: mean.value }] : []),
                ],
              },
            }, {
              name: '每日收盘',
              type: 'line',
              data: intradayCloses(rows),
              showAllSymbol: true,
              symbol: 'circle',
              symbolSize: 6,
              connectNulls: false,
              lineStyle: { color: colors.secondary, width: 1, opacity: 0.55 },
              itemStyle: { color: colors.text, borderColor: colors.surface, borderWidth: 1 },
              z: 3,
            }],
          })}
        />
        )}
      </div>
    </Card>
  );
}
