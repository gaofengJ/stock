'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Empty, Segmented, Select,
} from 'antd';
import { BreadthSeries } from '@/api/market';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { chartColors } from '@/colors';
import { numberText } from '@/utils/format';
import { LoadingOverlay } from '@/components/Loading';
import useMarketData from './useMarketData';
import { breadthDelta, environmentRanges } from './market-environment';
import { seriesAverage } from './market-display';
import { overviewDateAxis, overviewGrid } from './overview-chart';

export default function MarketBreadthChart({ range }: { range: string }) {
  const {
    data, loading, error, retry,
  } = useMarketData<BreadthSeries>('breadth', { days: 730 });
  const [period, setPeriod] = useState<'ma20' | 'ma60'>('ma20');
  const [days, setDays] = useState(60);
  const rows = (days === 730 ? data?.series : data?.series.slice(-days)) || [];
  const measure = data?.snapshot?.[period];
  const delta = data?.snapshot ? breadthDelta(data.series, period) : null;
  const pending = !!data && rows.some((r) => !r.data) && data.stage?.status !== 'failed';
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(retry, 30000);
    return () => clearInterval(timer);
  }, [pending, retry]);
  const anyData = rows.some((r) => r.data?.[period].ratio != null);
  const mean = seriesAverage(rows.map((r) => r.data?.[period].ratio));
  return (
    <Card
      className="market-chart market-environment-card"
      title={(
        <span className="market-section-title">
          {`${range} - 均线广度`}
          <HelpTooltip label="均线广度" title="复权收盘价高于所选均线的股票占比，含ST；剔除无成交、上市不足对应交易日及无有效均线的样本。" />
        </span>
)}
      extra={(
        <div className="market-chart-controls">
          <Segmented aria-label="均线广度周期" value={period} onChange={(value) => setPeriod(value as 'ma20' | 'ma60')} options={[{ value: 'ma20', label: 'MA20' }, { value: 'ma60', label: 'MA60' }]} />
          <Select aria-label="均线广度日期范围" value={days} onChange={setDays} options={environmentRanges} />
        </div>
      )}
    >
      <div className="market-breadth-state" aria-busy={loading}>
        {error && <Alert type="error" message={error} action={<Button size="small" onClick={retry}>重试</Button>} />}
        <div className={loading ? 'market-data-content is-pending' : undefined} aria-hidden={loading}>
          <div className="market-amount-summary">
            <span>
              <span>{`收盘价高于${period.toUpperCase()}`}</span>
              <strong>{numberText(measure?.ratio)}</strong>
              <span>%</span>
            </span>
            <span>
              <span>较上一交易日</span>
              <strong>{numberText(delta, 2, true)}</strong>
              <span>个百分点</span>
            </span>
          </div>
          <div className="market-volume-baselines">
            <div>
              <span>高于均线 / 有效样本</span>
              <div>
                <strong>{`${numberText(measure?.above, 0)} / ${numberText(measure?.eligible, 0)}`}</strong>
                <span>只</span>
              </div>
              <span>{`当日有成交 ${numberText(data?.snapshot?.total, 0)} 只`}</span>
            </div>
            <div>
              <span>未纳入样本</span>
              <div>
                <strong>{numberText(measure ? measure.insufficient + measure.missing : null, 0)}</strong>
                <span>只</span>
              </div>
              <span>{measure ? `均线不足 ${measure.insufficient} 只，数据缺失 ${measure.missing} 只` : '当日广度待更新'}</span>
            </div>
          </div>
          {!!rows.length && <div className="market-environment-caption">{`区间 ${rows[0].date} → ${rows.at(-1)!.date} · 均值按区间内有效交易日计算`}</div>}
          {!anyData ? (
            <div className="market-environment-empty"><Empty description={data?.stage?.status === 'failed' ? '均线数据暂不可用，请查看同步任务' : '均线广度正在补齐'} /></div>
          ) : (
            <CChart genOptions={() => ({
              tooltip: {
                trigger: 'axis',
                renderMode: 'richText',
                formatter: (params: any) => {
                  const row = rows[(Array.isArray(params) ? params[0] : params)?.dataIndex];
                  const point = row?.data?.[period];
                  return point ? `${row.date}\n高于${period.toUpperCase()}  ${numberText(point.ratio)}%\n${numberText(point.above, 0)} / ${numberText(point.eligible, 0)} 只有效样本` : `${row?.date || ''}\n数据待补齐`;
                },
              },
              legend: { top: 0 },
              grid: overviewGrid,
              xAxis: overviewDateAxis(rows.map((r) => r.date)),
              yAxis: {
                type: 'value', name: '%', min: 0, max: 100,
              },
              series: [{
                name: `高于${period.toUpperCase()}占比`,
                type: 'line',
                data: rows.map((r) => r.data?.[period].ratio ?? null),
                connectNulls: false,
                showSymbol: rows.length <= 30,
                itemStyle: { color: chartColors.teal },
                lineStyle: { width: 1.5 },
                markLine: {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: chartColors.reference, type: 'dashed', width: 1 },
                  label: { position: 'insideEndTop', formatter: '{b}', color: chartColors.reference },
                  data: mean == null ? [] : [{ name: `区间均值 ${numberText(mean)}%`, yAxis: mean }],
                },
              }],
            })}
            />
          )}
          {!!anyData && rows.some((r) => !r.data) && <div className="market-environment-caption">部分历史日期待补齐，缺失处保留断点。</div>}
        </div>
        {loading && <LoadingOverlay />}
      </div>
    </Card>
  );
}
