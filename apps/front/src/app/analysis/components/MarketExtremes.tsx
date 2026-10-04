'use client';

import { useState } from 'react';
import {
  Alert, Button, Card, Drawer, Empty, Segmented, Space,
} from 'antd';
import Table from '@/components/DataTable';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingOverlay } from '@/components/Loading';
import { quoteColors } from '@/colors';
import { numberText } from '@/utils/format';
import useMarketData from './useMarketData';
import { useMarket } from './MarketContext';

interface Measure { high: number; low: number; highRatio: number | null; lowRatio: number | null; eligible: number; excluded: number }
interface Extremes { date: string; scope: string; ready: boolean; period: number; snapshot: Measure | null; series: { date: string; data: Measure | null }[]; items: { code: string; name: string; high: boolean; low: boolean; change: number }[] }
export default function MarketExtremes({ range }: { range: string }) {
  const [period, setPeriod] = useState(20);
  const [metric, setMetric] = useState('count');
  const [detail, setDetail] = useState<'high' | 'low' | null>(null);
  const { date, scope } = useMarket();
  const {
    data: response, loading, error, retry,
  } = useMarketData<Extremes>('extremes', { period, days: 60 });
  const data = response?.date === date && response.scope === scope && response.period === period ? response : null;
  const summary = data?.snapshot;
  const series = data?.series || [];
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
      <div style={{ position: 'relative', minHeight: 360 }}>
        {error && <Alert type="error" message={error} action={<Button onClick={retry}>重试</Button>} />}
        <Space size={24} wrap className="mb-16">
          <Button type="text" disabled={!data?.ready} onClick={() => setDetail('high')}><span className="quote-up">{`新高 ${numberText(summary?.high, 0)}只 / ${numberText(summary?.highRatio)}%`}</span></Button>
          <Button type="text" disabled={!data?.ready} onClick={() => setDetail('low')}><span className="quote-down">{`新低 ${numberText(summary?.low, 0)}只 / ${numberText(summary?.lowRatio)}%`}</span></Button>
          <Segmented aria-label="新高新低显示指标" value={metric} onChange={(v) => setMetric(String(v))} options={[{ label: '家数', value: 'count' }, { label: '占比', value: 'ratio' }]} />
        </Space>
        {series.some((r) => r.data) ? (
          <CChart genOptions={() => ({
            tooltip: { trigger: 'axis', renderMode: 'richText' },
            legend: { top: 0 },
            grid: {
              left: 16, right: 20, top: 52, bottom: 24, containLabel: true,
            },
            xAxis: {
              type: 'category', data: series.map((r) => r.date), boundaryGap: false, axisTick: { alignWithLabel: true }, axisLabel: { hideOverlap: true },
            },
            yAxis: { type: 'value', name: metric === 'ratio' ? '%' : '只', min: 0 },
            series: (['high', 'low'] as const).map((key) => ({
              name: key === 'high' ? '新高' : '新低', type: 'line', connectNulls: false, showSymbol: false, lineStyle: { width: 1.5 }, itemStyle: { color: key === 'high' ? quoteColors.up : quoteColors.down }, data: series.map((r) => (metric === 'ratio' ? r.data?.[key === 'high' ? 'highRatio' : 'lowRatio'] : r.data?.[key]) ?? null),
            })),
          })}
          />
        ) : !loading && <Empty description="新高新低数据待补齐" />}
        <div className="market-environment-caption">{summary ? `有效样本 ${summary.eligible} 只，历史不足 ${summary.excluded} 只；点击家数查看名单。` : '历史数据分批补齐，缺失处保留断点。'}</div>
        {loading && <LoadingOverlay />}
      </div>
      <Drawer title={`${data?.date || ''} - ${period}日${detail === 'high' ? '新高' : '新低'}`} width={640} open={!!detail} onClose={() => setDetail(null)}>
        <Table
          rowKey="code"
          pagination={false}
          dataSource={data?.items.filter((r) => detail && r[detail]) || []}
          columns={[{ title: '代码', dataIndex: 'code' }, { title: '名称', dataIndex: 'name' }, {
            title: `${period}日涨跌幅(%)`, dataIndex: 'change', align: 'right', sorter: (a, b) => a.change - b.change, render: (v) => <span className={v > 0 ? 'quote-up' : 'quote-down'}>{numberText(v, 2, true)}</span>,
          }]}
          maxBodyHeight={900}
        />
      </Drawer>
    </Card>
  );
}
