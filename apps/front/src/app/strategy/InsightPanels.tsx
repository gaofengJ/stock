'use client';

import { useState } from 'react';
import {
  Alert, Button, Card, Col, Empty, Modal, Row, Segmented, Select, Space, Tag,
} from 'antd';
import Table from '@/components/DataTable';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { LoadingOverlay } from '@/components/Loading';
import { changeClass, numberText } from '@/utils/format';
import { chartColors } from '@/colors';
import useInsight from './useInsight';

interface HotRow { code: string; name: string; rank: number; previousRank: number | null; change: number | null; state: string; streak: number; streakCapped: boolean; history: { date: string; rank: number | null; ready: boolean }[] }
interface Popularity { date: string; ready: boolean; complete: boolean; count: number; previousReady: boolean; previousDate: string | null; rankTime: string | null; items: HotRow[]; exited: { code: string; name: string; rank: number }[]; stage: { status: string; error: string | null } | null }
interface CompareRow { code: string; name: string; strategies: string[]; periods: Record<string, { change: number; rps: number | null } | null>; relative: Record<string, number | null>; industryAsOf: string | null }
interface Comparison { ready: boolean; items: CompareRow[]; popularity: Popularity }
interface Summary { horizon: number; sample: number; total: number; pending: number; missing: number; average: number | null; median: number | null; riseRate: number | null }
interface Observation { date: string; code: string; name: string; environment: string; outcomes: Record<string, { date: string | null; value: number | null; state: string }> }
interface Performance { readyDays: number; expectedDays: number; version: string; summary: Summary[]; groups: { name: string; summary: Summary[] }[]; items: Observation[]; sectorSnapshots: { date: string; asOf: string | null }[] }
const change = (v?: number | null) => <span className={changeClass(v)}>{numberText(v, 2, true)}</span>;
function rankChange(row?: HotRow) {
  if (row?.change != null) {
    let label = '持平';
    if (row.change > 0) label = `↑ ${row.change}`;
    if (row.change < 0) label = `↓ ${-row.change}`;
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

export function CandidateComparison({
  date, candidates, strategies, onStock,
}: { date: string; candidates: any[]; strategies: { key: string; label: string }[]; onStock: (row: any) => void }) {
  const state = useInsight<Comparison>('comparison', { date });
  const [selected, setSelected] = useState<string[]>([]);
  const [period, setPeriod] = useState(20);
  const [codes, setCodes] = useState<React.Key[]>([]);
  const [onlySelected, setOnlySelected] = useState(false);
  const details = new Map(state.data?.items.map((r) => [r.code, r]) || []);
  const hot = new Map(state.data?.popularity.items.map((r) => [r.code, r]) || []);
  const rows = candidates.map((r) => ({ ...r, detail: details.get(r.tsCode), hot: hot.get(r.tsCode) })).filter((r) => selected.every((s) => r.detail?.strategies.includes(s)) && (!onlySelected || codes.includes(r.tsCode)));
  return (
    <div className="strategy-insight-panel">
      <Space wrap size={[16, 12]} className="mb-16">
        <Segmented aria-label="比较周期" value={period} onChange={(v) => setPeriod(Number(v))} options={[{ label: '20日', value: 20 }, { label: '60日', value: 60 }]} />
        <Select aria-label="多策略交集" placeholder="同时命中策略（标准参数）" mode="multiple" allowClear style={{ minWidth: 300 }} value={selected} onChange={setSelected} options={strategies.map((s) => ({ value: s.key, label: s.label }))} />
        <Button disabled={!onlySelected && !codes.length} onClick={() => setOnlySelected((v) => !v)}>{onlySelected ? '显示全部候选' : `只比较勾选的 ${codes.length} 只`}</Button>
        <HelpTooltip label="横向比较口径" title="RPS为全市场同期涨幅百分位，越高越强；行业超额为个股涨幅减同花顺行业指数涨幅。多策略命中按标准参数计算。" />
      </Space>
      {state.data && !state.data.ready && <Alert className="mb-16" type="info" message="观察数据待补齐，候选列表仍可查看。" />}
      <Table
        rowKey="tsCode"
        pagination={false}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: codes, onChange: setCodes }}
        scroll={{ x: 'max-content' }}
        maxBodyHeight={520}
        minBodyHeight={360}
        columns={[
          {
            title: '股票', key: 'stock', fixed: 'left', width: 180, render: (_, r) => <Button type="link" onClick={() => onStock(r)}>{`${r.name} ${r.tsCode.split('.')[0]}`}</Button>,
          },
          { title: '行业', dataIndex: 'industry', width: 110 },
          {
            title: '当日涨跌(%)', dataIndex: 'pctChg', align: 'right', sorter: (a, b) => Number(a.pctChg) - Number(b.pctChg), render: change,
          },
          {
            title: `${period}日涨跌(%)`, key: 'period', align: 'right', sorter: (a, b) => (a.detail?.periods[period]?.change ?? -Infinity) - (b.detail?.periods[period]?.change ?? -Infinity), render: (_, r) => change(r.detail?.periods[period]?.change),
          },
          {
            title: `RPS${period}`, key: 'rps', align: 'right', defaultSortOrder: 'descend', sorter: (a, b) => (a.detail?.periods[period]?.rps ?? -1) - (b.detail?.periods[period]?.rps ?? -1), render: (_, r) => numberText(r.detail?.periods[period]?.rps),
          },
          {
            title: '行业超额(百分点)',
            key: 'relative',
            align: 'right',
            sorter: (a, b) => (a.detail?.relative[period] ?? -Infinity) - (b.detail?.relative[period] ?? -Infinity),
            render: (_, r) => (
              <Space>
                {change(r.detail?.relative[period])}
                {r.detail?.industryAsOf && <HelpTooltip label="行业成分日期" title={`成分基准 ${r.detail.industryAsOf}`} />}
              </Space>
            ),
          },
          {
            title: '同时命中（标准参数）', key: 'hits', width: 270, render: (_, r) => <Space size={[0, 4]} wrap>{r.detail?.strategies.map((key: string) => <Tag key={key}>{strategies.find((s) => s.key === key)?.label || key}</Tag>) || '—'}</Space>,
          },
          {
            title: '人气排名', key: 'rank', width: 100, align: 'right', render: (_, r) => r.hot?.rank ?? '—',
          },
          {
            title: '排名变化', key: 'rankChange', width: 110, align: 'right', render: (_, r) => rankChange(r.hot),
          },
        ]}
      />
      <PanelState loading={state.loading} error={state.error} retry={state.retry} />
    </div>
  );
}

export function SignalPerformance({
  date, strategy, sector, onStock,
}: { date: string; strategy: string; sector?: string; onStock: (row: Observation) => void }) {
  const [days, setDays] = useState(20);
  const [horizon, setHorizon] = useState(5);
  const state = useInsight<Performance>('performance', {
    date, strategyType: strategy, sector, days,
  });
  const { data } = state;
  return (
    <div className="strategy-insight-panel">
      <Space wrap className="mb-16">
        <strong>标准参数信号表现</strong>
        <Segmented aria-label="信号统计范围" value={days} onChange={(v) => setDays(Number(v))} options={[{ label: '近20个交易日', value: 20 }, { label: '近60个交易日', value: 60 }]} />
        <HelpTooltip label="信号表现口径" title="信号日复权收盘至后续第1/3/5/10个交易日收盘。同股不同日期分别计样本；未到期、无成交与缺数据不计入均值。不是交易收益。" />
        <span>{data ? `已就绪 ${data.readyDays}/${data.expectedDays} 个信号日` : ''}</span>
      </Space>
      <Alert className="mb-16" type="info" message="按标准参数观察，不跟随上方自定义参数；不含交易成本。" />
      {!!sector && <div className="market-environment-caption mb-16">按信号日已有的行业／题材成分筛选；没有历史成分的日期不纳入统计。</div>}
      <Row gutter={[16, 16]} className="mb-16">
        {data?.summary.map((r) => (
          <Col xs={12} xl={6} key={r.horizon}>
            <Card size="small" title={`后${r.horizon}日`}>
              <div className="strategy-observation-main">
                {change(r.average)}
                <small> % 平均涨跌</small>
              </div>
              <div className="strategy-observation-meta">
                <span>{`上涨占比 ${numberText(r.riseRate)}%`}</span>
                <span>{`中位数 ${numberText(r.median)}%`}</span>
              </div>
              <div className="strategy-observation-meta">{`有效 ${r.sample} / 未到期 ${r.pending} / 数据不足 ${r.missing}`}</div>
            </Card>
          </Col>
        ))}
      </Row>
      <Space className="mb-16">
        <strong>不同市场环境</strong>
        <Segmented aria-label="环境表现周期" value={horizon} onChange={(v) => setHorizon(Number(v))} options={[1, 3, 5, 10].map((v) => ({ label: `后${v}日`, value: v }))} />
      </Space>
      <Table
        rowKey="name"
        pagination={false}
        dataSource={data?.groups.map((g) => ({ name: g.name, ...g.summary.find((r) => r.horizon === horizon) })) || []}
        columns={[{ title: '信号日市场环境', dataIndex: 'name' }, { title: '有效样本', dataIndex: 'sample', align: 'right' }, {
          title: '平均涨跌(%)', dataIndex: 'average', align: 'right', render: change,
        }, {
          title: '中位数(%)', dataIndex: 'median', align: 'right', render: change,
        }, {
          title: '上涨占比(%)', dataIndex: 'riseRate', align: 'right', render: (v) => numberText(v),
        }]}
      />
      <div className="strategy-result-toolbar">
        <strong>信号明细</strong>
        <span>截止所选交易日，未到期保留空值</span>
      </div>
      <Table
        rowKey={(r) => `${r.date}-${r.code}`}
        virtual
        pagination={false}
        dataSource={data?.items || []}
        scroll={{ x: 1100 }}
        maxBodyHeight={460}
        minBodyHeight={360}
        columns={[
          { title: '信号日期', dataIndex: 'date', width: 115 }, {
            title: '股票', key: 'stock', width: 180, render: (_, r) => <Button type="link" onClick={() => onStock(r)}>{`${r.name} ${r.code.split('.')[0]}`}</Button>,
          },
          ...[1, 3, 5, 10].map((h) => ({
            title: `后${h}日(%)`, key: String(h), align: 'right' as const, render: (_: unknown, r: Observation) => (r.outcomes[h].value == null ? <span title={r.outcomes[h].state}>{r.outcomes[h].state === '未到期' ? '未到期' : '—'}</span> : change(r.outcomes[h].value)),
          })),
        ]}
      />
      <PanelState loading={state.loading} error={state.error} retry={state.retry} />
    </div>
  );
}

export function PopularityChanges({ date }: { date: string }) {
  const state = useInsight<Popularity>('popularity', { date });
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<HotRow | null>(null);
  const { data } = state;
  const rows = data?.items.filter((r) => filter === 'all' || (filter === 'new' && r.state === 'new') || (filter === 'up' && (r.change || 0) > 0) || (filter === 'down' && (r.change || 0) < 0)) || [];
  const current = data?.items.find((r) => r.code === selected?.code);
  return (
    <div className="strategy-insight-panel">
      <Space wrap className="mb-16">
        <strong>同花顺日终热股 Top100</strong>
        <span>{data?.rankTime || '日终榜单待更新'}</span>
        <HelpTooltip label="人气变化口径" title="对比上一交易日日终榜单，数字为上升／下降名次；热度不作为默认选股条件。" />
      </Space>
      {data?.ready && (!data.complete || !data.previousReady) && <Alert className="mb-16" type="info" message={`当日返回 ${data.count}/100 条。前后榜单有缺位时，仅比较已有排名，不将缺数据判为新上榜或离榜。`} />}
      {data && !data.ready && <Alert className="mb-16" type={data.stage?.status === 'failed' ? 'warning' : 'info'} message={data.stage?.status === 'failed' ? '日终人气数据暂不可用，请查看同步任务。' : '日终人气数据正在补齐。'} />}
      <Segmented className="mb-16" aria-label="人气变化筛选" value={filter} onChange={(v) => setFilter(String(v))} options={[{ label: '全部', value: 'all' }, { label: '排名上升', value: 'up' }, { label: '排名下降', value: 'down' }, { label: '新上榜', value: 'new' }, { label: '离榜', value: 'exit' }]} />
      {filter === 'exit' ? <Table rowKey="code" pagination={false} dataSource={data?.exited || []} locale={{ emptyText: !data?.complete ? '当日榜单不完整，暂不判断离榜' : '没有离榜股票' }} columns={[{ title: '股票', dataIndex: 'name' }, { title: '代码', dataIndex: 'code' }, { title: '上一交易日排名', dataIndex: 'rank' }]} />
        : (
          <Table
            rowKey="code"
            pagination={false}
            dataSource={rows}
            maxBodyHeight={560}
            minBodyHeight={360}
            columns={[
              { title: '排名', dataIndex: 'rank', width: 85 }, { title: '股票', key: 'stock', render: (_, r) => <Button type="link" onClick={() => setSelected(r)}>{`${r.name} ${r.code.split('.')[0]}`}</Button> },
              {
                title: '上一交易日', dataIndex: 'previousRank', align: 'right', render: (v) => v ?? '—',
              }, {
                title: '排名变化', key: 'change', align: 'right', sorter: (a, b) => (a.change ?? -Infinity) - (b.change ?? -Infinity), render: (_, r) => rankChange(r),
              },
              {
                title: '连续上榜', key: 'streak', align: 'right', render: (_, r) => `${r.streakCapped ? '≥' : ''}${r.streak}个交易日`,
              }, { title: '走势', key: 'trend', render: (_, r) => <Button type="link" onClick={() => setSelected(r)}>排名趋势</Button> },
            ]}
          />
        )}
      <Modal title={`${current?.name || ''} - 近20个交易日人气排名`} open={!!current} onCancel={() => setSelected(null)} footer={null} width={900}>
        {current ? (
          <CChart genOptions={() => ({
            tooltip: { trigger: 'axis', renderMode: 'richText', formatter: (p: any) => { const point = current.history[(Array.isArray(p) ? p[0] : p)?.dataIndex]; const label = point?.ready ? '未入榜' : '榜单数据不足'; return `${point?.date || ''}\n${point?.rank != null ? `第 ${point.rank} 名` : label}`; } },
            grid: {
              left: 40, right: 20, top: 35, bottom: 30, containLabel: true,
            },
            xAxis: {
              type: 'category', data: current.history.map((r) => r.date), boundaryGap: false, axisTick: { alignWithLabel: true }, axisLabel: { hideOverlap: true },
            },
            yAxis: {
              type: 'value', name: '名次', inverse: true, min: 1, max: 100,
            },
            series: [{
              name: '人气排名', type: 'line', data: current.history.map((r) => r.rank), connectNulls: false, showSymbol: true, itemStyle: { color: chartColors.blue }, lineStyle: { width: 1.5 },
            }],
          })}
          />
        ) : <Empty />}
        <div className="market-environment-caption">排名越靠上人气越高；未入榜或数据缺失均保留断点。</div>
      </Modal>
      <PanelState loading={state.loading} error={state.error} retry={state.retry} />
    </div>
  );
}
