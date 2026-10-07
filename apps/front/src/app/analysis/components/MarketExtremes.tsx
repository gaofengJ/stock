'use client';

import { InteractionButton } from '@/components/Interaction';
import { StockLink } from '@/components/StockActions';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Drawer, Empty, Segmented, Space,
} from 'antd';
import Table from '@/components/DataTable';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingOverlay } from '@/components/Loading';
import { chartColors, quoteColors } from '@/colors';
import { numberText } from '@/utils/format';
import useMarketData from './useMarketData';
import { useMarket } from './MarketContext';
import { overviewDateAxis, overviewGrid } from './overview-chart';
import {
  Extremes, ExtremeKey, ExtremeMetric, extremeSummary, extremeValues, extremeMean,
} from './market-extremes';

function ExtremeDetails({
  date, scope, period, kind,
}: { date: string; scope: string; period: number; kind: ExtremeKey }) {
  const {
    data, loading, error, retry,
  } = useMarketData<Extremes>('extremes', {
    date, scope, period, days: 20,
  });
  const current = data?.date === date && data.scope === scope && data.period === period ? data : null;
  return (
    <div style={{ position: 'relative', minHeight: 120 }}>
      {error && <Alert type="error" message={error} action={<Button onClick={retry}>重试</Button>} />}
      {!loading && !error && !current?.ready && <Alert type="info" message="该日名单正在更新，请稍后重试" action={<Button onClick={retry}>刷新</Button>} />}
      {current?.ready && !loading && !error && (
        <Table
          rowKey="code"
          pagination={false}
          dataSource={current.items.filter((row) => row[kind])}
          columns={[{ title: '代码', dataIndex: 'code', render: (_, r) => <StockLink code={r.code} name={r.name} label={r.code} date={date} /> }, { title: '名称', dataIndex: 'name', render: (_, r) => <StockLink code={r.code} name={r.name} date={date} /> }, {
            title: `${period}日涨跌幅(%)`, dataIndex: 'change', align: 'right', sorter: (a, b) => a.change - b.change, render: (v) => <span className={v > 0 ? 'quote-up' : 'quote-down'}>{numberText(v, 2, true)}</span>,
          }]}
          maxBodyHeight={900}
        />
      )}
      {loading && <LoadingOverlay />}
    </div>
  );
}

export default function MarketExtremes({ range }: { range: string }) {
  const [period, setPeriod] = useState(20);
  const [metric, setMetric] = useState<ExtremeMetric>('count');
  const [detail, setDetail] = useState<{ date: string; scope: string; period: number; kind: ExtremeKey } | null>(null);
  const [legendSelected, setLegendSelected] = useState<Record<string, boolean>>({});
  const { date, scope } = useMarket();
  const {
    data: response, loading, error, retry,
  } = useMarketData<Extremes>('extremes', { period, days: 60 });
  const data = response?.date === date && response.scope === scope && response.period === period ? response : null;
  const summaryRow = extremeSummary(data);
  const summary = summaryRow?.data;
  const series = data?.series || [];
  const mean = extremeMean(series, metric, legendSelected);
  const pending = !!data && !data.snapshot;
  useEffect(() => {
    if (!pending || error) return undefined;
    const timer = setInterval(() => { if (!document.hidden) retry(); }, 30000);
    return () => clearInterval(timer);
  }, [pending, error, retry]);
  useEffect(() => { setDetail(null); }, [date, scope, period]);
  const showDetails = (kind: ExtremeKey) => {
    if (summaryRow) {
      setDetail({
        date: summaryRow.date, scope, period, kind,
      });
    }
  };
  return (
    <Card
      className="market-chart market-environment-card"
      title={(
        <Space>
          {`${range} - 新高与新低`}
          <HelpTooltip label="新高与新低" title="复权收盘价严格突破此前20/60个交易日的收盘价高低；含ST，剔除无成交与历史不足。占比以有效样本为分母。" />
        </Space>
)}
      extra={<Segmented aria-label="新高新低周期" value={period} onChange={(v) => setPeriod(Number(v))} options={[{ label: '20日', value: 20 }, { label: '60日', value: 60 }]} />}
    >
      <div className="market-extremes-content" aria-busy={loading}>
        <div className="market-environment-caption market-extremes-date">{summaryRow ? `${summaryRow.date === date ? '统计日期' : '最近有效数据'} ${summaryRow.date}` : `统计日期 ${date}`}</div>
        <div className="market-extremes-controls">
          <InteractionButton intent="preview" disabled={!summary || loading || !!error} onClick={() => showDetails('high')}><span className="quote-up">{summary ? `新高 ${numberText(summary.high, 0)}只 / ${numberText(summary.highRatio)}%` : '新高 待更新'}</span></InteractionButton>
          <InteractionButton intent="preview" disabled={!summary || loading || !!error} onClick={() => showDetails('low')}><span className="quote-down">{summary ? `新低 ${numberText(summary.low, 0)}只 / ${numberText(summary.lowRatio)}%` : '新低 待更新'}</span></InteractionButton>
          <Segmented aria-label="新高新低显示指标" value={metric} onChange={(v) => setMetric(v as ExtremeMetric)} options={[{ label: '家数', value: 'count' }, { label: '占比', value: 'ratio' }]} />
        </div>
        <div className="market-extremes-plot">
          <div className="market-extremes-notice">
            {error && <Alert type="error" message={error} action={<Button onClick={retry}>重试</Button>} />}
            {pending && !error && <Alert type="info" showIcon message={`${date} 数据待更新${summaryRow && summaryRow.date !== date ? `，摘要显示 ${summaryRow.date} 的有效数据` : ''}`} action={<Button disabled={loading} onClick={retry}>刷新</Button>} />}
          </div>
          {series.some((r) => r.data) ? (
            <CChart
              onLegendChange={setLegendSelected}
              genOptions={() => ({
                tooltip: { trigger: 'axis', renderMode: 'richText', valueFormatter: (value: unknown) => `${numberText(value, metric === 'ratio' ? 2 : 0)}${metric === 'ratio' ? '%' : '只'}` },
                legend: { top: 0, selected: legendSelected },
                grid: overviewGrid,
                xAxis: overviewDateAxis(series.map((r) => r.date)),
                yAxis: { type: 'value', name: metric === 'ratio' ? '%' : '只', min: 0 },
                series: (['high', 'low'] as const).map((key) => ({
                  name: key === 'high' ? '新高' : '新低',
                  type: 'line',
                  connectNulls: false,
                  showSymbol: false,
                  lineStyle: { width: 1.5 },
                  itemStyle: { color: key === 'high' ? quoteColors.up : quoteColors.down },
                  data: extremeValues(series, key, metric),
                  markLine: {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { color: chartColors.reference, type: 'dashed', width: 1 },
                    label: { position: 'insideEndTop', formatter: '{b}', color: chartColors.reference },
                    data: mean?.key === key ? [{ name: `区间均值 ${numberText(mean.value)}${metric === 'ratio' ? '%' : '只'}`, yAxis: mean.value }] : [],
                  },
                })),
              })}
            />
          ) : !loading && <Empty description="新高新低数据待补齐" />}
          {loading && <LoadingOverlay />}
        </div>
        <div className="market-environment-caption market-extremes-footer">
          {summary ? `有效样本 ${summary.eligible} 只，历史不足 ${summary.excluded} 只；点击家数查看对应日期名单。` : '历史数据分批补齐，缺失处保留断点。'}
          仅显示一条曲线时展示区间均值，缺失日期不参与计算。
        </div>
      </div>
      <Drawer title={`${detail?.date || ''} - ${detail?.period || period}日${detail?.kind === 'high' ? '新高' : '新低'}`} width={640} open={!!detail} onClose={() => setDetail(null)} destroyOnClose>
        {detail && <ExtremeDetails date={detail.date} scope={detail.scope} period={detail.period} kind={detail.kind} />}
      </Drawer>
    </Card>
  );
}
