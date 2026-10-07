'use client';

import { InteractionButton } from '@/components/Interaction';
import StockActions, { StockLink } from '@/components/StockActions';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Empty, Modal, Segmented, Space, Tag,
} from 'antd';
import Table from '@/components/DataTable';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingOverlay } from '@/components/Loading';
import { changeClass } from '@/utils/format';
import { chartColors } from '@/colors';
import useInsight from './useInsight';
import './popularity.css';

export interface HotRow { code: string; name: string; rank: number; previousRank: number | null; change: number | null; state: string; streak: number; streakCapped: boolean; history: { date: string; rank: number | null; ready: boolean }[] }
export interface Popularity { date: string; ready: boolean; complete: boolean; count: number; previousReady: boolean; previousDate: string | null; rankTime: string | null; items: HotRow[]; exited: { code: string; name: string; rank: number }[]; stage: { status: string; error: string | null } | null }
export function rankChange(row?: HotRow) {
  if (row?.change != null) {
    let label = '持平';
    if (row.change > 0) label = `上升${row.change}名`;
    if (row.change < 0) label = `下降${-row.change}名`;
    return <span className={changeClass(row.change)}>{label}</span>;
  }
  return row?.state === 'new' ? <Tag color="blue">新上榜</Tag> : '—';
}
function PanelState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return (
    <>
      {error && <Alert className="mb-16" type="error" message={error} action={<Button onClick={retry}>重试</Button>} />}
      {loading && <LoadingOverlay />}
    </>
  );
}

export function PopularityTrend({
  date, code, name, endpoint = 'popularity', onClose,
}: { date: string; code?: string; name?: string; endpoint?: string; onClose: () => void }) {
  const state = useInsight<Popularity>(endpoint, { date, code }, !!code);
  const current = state.data?.items.find((row) => row.code === code);
  const spansYears = current?.history.some((point) => point.date.slice(0, 4) !== current.history[0]?.date.slice(0, 4));
  return (
    <Modal className="popularity-trend-modal" title={`${current?.name || name || code || ''} - 近20个交易日人气排名`} open={!!code} onCancel={onClose} footer={null} width={900} style={{ top: 24, maxWidth: 'calc(100vw - 32px)' }}>
      {code && <StockActions code={code} name={current?.name || name} date={date} />}
      <div className="popularity-trend-chart">
        {current ? (
          <CChart genOptions={() => ({
            tooltip: { trigger: 'axis', renderMode: 'richText', formatter: (p: any) => { const point = current.history[(Array.isArray(p) ? p[0] : p)?.dataIndex]; const label = point?.ready ? '未入榜' : '榜单数据不足'; return `${point?.date || ''}\n${point?.rank != null ? `第 ${point.rank} 名` : label}`; } },
            grid: {
              left: 12, right: spansYears ? 40 : 20, top: 32, bottom: 12, containLabel: true,
            },
            xAxis: {
              type: 'category',
              data: current.history.map((r) => r.date),
              boundaryGap: false,
              axisTick: { alignWithLabel: true },
              axisLabel: {
                hideOverlap: true,
                formatter: (value: string) => (spansYears ? value : value.slice(5)),
              },
            },
            yAxis: {
              type: 'value', name: '名次', nameLocation: 'start', nameGap: 16, inverse: true, min: 1, max: 100, minInterval: 1,
            },
            series: [{
              name: '人气排名', type: 'line', data: current.history.map((r) => r.rank), connectNulls: false, showSymbol: true, itemStyle: { color: chartColors.blue }, lineStyle: { width: 1.5 },
            }],
          })}
          />
        ) : <PanelState loading={state.loading} error={state.error} retry={state.retry} />}
        {!current && !state.loading && !state.error && <Empty description="该日期没有可展示的人气记录" />}
      </div>
      <p className="popularity-trend-caption">排名越靠上人气越高；未入榜或数据缺失均保留断点。</p>
    </Modal>
  );
}

export function PopularityChanges({ date, code, endpoint = '/analysis/market/popularity' }: { date: string; code?: string | null; endpoint?: string }) {
  const state = useInsight<Popularity>(endpoint, { date });
  const [filter, setFilter] = useState('all');
  const [focusCode, setFocusCode] = useState(code || '');
  useEffect(() => { setFocusCode(code || ''); }, [code]);
  const [selected, setSelected] = useState<HotRow | null>(null);
  const { data } = state;
  const unavailableMessage = () => {
    if (data?.stage?.status === 'skipped') return '该日人气数据已标记为不再补齐。';
    if (data?.stage?.status === 'failed') return '日终人气数据暂不可用，请查看同步任务。';
    return '日终人气数据正在补齐。';
  };
  const rows = data?.items.filter((r) => !focusCode || r.code === focusCode).filter((r) => filter === 'all' || (filter === 'new' && r.state === 'new') || (filter === 'up' && (r.change || 0) > 0) || (filter === 'down' && (r.change || 0) < 0)) || [];

  return (
    <div className="strategy-insight-panel popularity-panel">
      <Space wrap size={[12, 8]} className="popularity-heading">
        <strong>同花顺日终热股 Top100</strong>
        {focusCode && (
        <Space>
          <span>{focusCode}</span>
          <Button size="small" onClick={() => setFocusCode('')}>查看全部</Button>
        </Space>
        )}
        <span>{data?.rankTime || '日终榜单待更新'}</span>
        <HelpTooltip label="人气变化口径" title="对比上一交易日日终榜单，展示名次变化。上升表示排名前移，下降表示排名后移。" />
      </Space>
      {data?.ready && (!data.complete || !data.previousReady) && <Alert className="mb-16" type="info" message={`当日返回 ${data.count}/100 条。前后榜单有缺位时，仅比较已有排名，不将缺数据判为新上榜或离榜。`} />}
      {data && !data.ready && <Alert className="mb-16" type={data.stage?.status === 'failed' ? 'warning' : 'info'} message={unavailableMessage()} />}
      <div className="popularity-filters">
        <Segmented aria-label="人气变化筛选" value={filter} onChange={(v) => setFilter(String(v))} options={[{ label: '全部', value: 'all' }, { label: '排名上升', value: 'up' }, { label: '排名下降', value: 'down' }, { label: '新上榜', value: 'new' }, { label: '离榜', value: 'exit' }]} />
      </div>
      {filter === 'exit' ? <Table rowKey="code" pagination={false} maxBodyHeight={Number.POSITIVE_INFINITY} bottomSpacing={24} dataSource={data?.exited.filter((r) => !focusCode || r.code === focusCode) || []} locale={{ emptyText: !data?.complete ? '当日榜单不完整，暂不判断离榜' : '没有离榜股票' }} columns={[{ title: '股票', dataIndex: 'name', render: (_, r) => <StockLink code={r.code} name={r.name} date={date} /> }, { title: '代码', dataIndex: 'code', render: (_, r) => <StockLink code={r.code} name={r.name} label={r.code} date={date} /> }, { title: '上一交易日排名', dataIndex: 'rank' }]} />
        : (
          <Table
            rowKey="code"
            pagination={false}
            dataSource={rows}
            locale={{ emptyText: focusCode ? '该股票未出现在所选日期的已取得榜单中' : '暂无记录' }}
            maxBodyHeight={Number.POSITIVE_INFINITY}
            bottomSpacing={24}
            columns={[
              { title: '排名', dataIndex: 'rank', width: 85 }, { title: '股票', key: 'stock', render: (_, r) => <StockLink code={r.code} name={r.name} label={`${r.name} ${r.code.split('.')[0]}`} date={date} /> },
              {
                title: '上一交易日', dataIndex: 'previousRank', align: 'right', render: (v) => v ?? '—',
              }, {
                title: '较上一交易日', key: 'change', align: 'right', sorter: (a, b) => (a.change ?? -Infinity) - (b.change ?? -Infinity), render: (_, r) => rankChange(r),
              },
              {
                title: '连续上榜', key: 'streak', align: 'right', render: (_, r) => `${r.streakCapped ? '≥' : ''}${r.streak}个交易日`,
              }, { title: '走势', key: 'trend', render: (_, r) => <InteractionButton intent="preview" onClick={() => setSelected(r)}>排名趋势</InteractionButton> },
            ]}
          />
        )}
      <PopularityTrend date={date} code={selected?.code} name={selected?.name} endpoint={endpoint} onClose={() => setSelected(null)} />
      <PanelState loading={state.loading} error={state.error} retry={state.retry} />
    </div>
  );
}
