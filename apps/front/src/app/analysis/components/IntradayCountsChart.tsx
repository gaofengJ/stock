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
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingOverlay } from '@/components/Loading';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { beijingTime, numberText } from '@/utils/format';
import { quoteColors } from '@/colors';
import { intradayPlot } from './intraday-counts-plot';

export default function IntradayCountsChart() {
  const [date, setDate] = useState('');
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
      onError: (cause) => { setError(errorMessage(cause, '盘中涨跌家数加载失败')); setLoadedKey(requestKey); },
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
  return (
    <Card
      title={(
        <span className="market-section-title">
          连日盘中涨跌家数
          <HelpTooltip label="连日盘中涨跌家数" title="固定展示财联社全市场口径，不随页面统计范围切换。交易时段每5分钟采集上涨、下跌家数，包含ST。横轴连续排列交易时段，午休压缩，缺失采样和跨日之间留空；悬停可查看采集日期和时间。历史从接入后积累，最多保留30个交易日。" />
        </span>
      )}
      extra={(
        <Space wrap>
          <DatePicker
            aria-label="盘中涨跌家数截止日期"
            value={date ? dayjs(date) : null}
            placeholder="最新交易日"
            onChange={(value) => setDate(value?.format('YYYY-MM-DD') || '')}
            disabledDate={(value) => value.format('YYYY-MM-DD') > new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}
          />
          <Select
            aria-label="盘中涨跌家数交易日范围"
            value={days}
            onChange={setDays}
            options={[1, 5, 10, 20, 30].map((value) => ({ value, label: value === 1 ? '最近1个交易日' : `近${value}个交易日` }))}
          />
        </Space>
      )}
      className="market-chart"
    >
      <p className="market-note">
        财联社全市场 · 每5分钟采集 · 保留30个交易日
        {latest && ` · 最新采集：${beijingTime(latest.collectedAt)}`}
      </p>
      {error && loadedKey === requestKey && <Alert type="warning" showIcon message={error} description={visible?.points.length ? '以下为上次成功读取的记录。' : undefined} action={<Button size="small" onClick={retry}>重试</Button>} />}
      {loading && !visible && <LoadingOverlay />}
      {!loading && !error && !rows.length && <Empty description="暂无盘中记录，交易时段开始采集后将自动显示；历史从接入后积累。" />}
      {rows.length > 0 && (
        <CChart
          height={360}
          genOptions={() => ({
            legend: { data: ['上涨家数', '下跌家数'], top: 0 },
            tooltip: {
              trigger: 'axis',
              renderMode: 'richText',
              formatter: (params: any) => {
                const index = (Array.isArray(params) ? params[0] : params)?.dataIndex;
                const row = rows[index];
                if (!row?.time) return '';
                return [
                  `${row.date} ${row.time}（北京时间）`,
                  row.point ? `上涨：${numberText(row.point.up, 0)}只\n下跌：${numberText(row.point.down, 0)}只` : '该时点未采集',
                ].join('\n');
              },
            },
            grid: {
              left: 16, right: 20, top: 45, bottom: 70, containLabel: true,
            },
            xAxis: {
              type: 'category',
              data: rows.map((row) => row.label),
              boundaryGap: false,
              axisTick: { show: false },
              axisLabel: {
                hideOverlap: true,
                interval: rows.length <= 51 ? 'auto' : (index: number) => rows[index].first,
                formatter: (_value: string, index: number) => (rows.length <= 51 ? rows[index].time : rows[index].date.slice(5)),
              },
            },
            yAxis: {
              type: 'value', name: '只', minInterval: 1, min: 0,
            },
            dataZoom: [
              { type: 'inside', filterMode: 'none' },
              {
                type: 'slider', bottom: 5, height: 20, filterMode: 'none',
              },
            ],
            series: [
              {
                name: '上涨家数',
                type: 'line',
                showSymbol: true,
                symbolSize: visible?.points.length === 1 ? 6 : 3,
                connectNulls: false,
                itemStyle: { color: quoteColors.up },
                data: rows.map((row) => row.point?.up ?? null),
                markLine: {
                  silent: true,
                  symbol: 'none',
                  label: { show: false },
                  lineStyle: { type: 'dashed', opacity: 0.25 },
                  data: rows.filter((row) => row.first).slice(1).map((row) => ({ xAxis: row.label })),
                },
              },
              {
                name: '下跌家数',
                type: 'line',
                showSymbol: true,
                symbolSize: visible?.points.length === 1 ? 6 : 3,
                connectNulls: false,
                itemStyle: { color: quoteColors.down },
                data: rows.map((row) => row.point?.down ?? null),
              },
            ],
          })}
        />
      )}
    </Card>
  );
}
