'use client';

import { InteractionButton } from '@/components/Interaction';
import { StockLink } from '@/components/StockActions';

import { useRef, useState } from 'react';
import { QuestionCircleOutlined } from '@ant-design/icons';
import {
  Alert, Button, Collapse, Popover, Segmented, Select, Space, Tag, Table as CompactTable,
} from 'antd';
import Table from '@/components/DataTable';
import HelpTooltip from '@/components/HelpTooltip';
import Loading from '@/components/Loading';
import { changeClass, numberText } from '@/utils/format';
import useInsight from './useInsight';
import StudyReport from './StudyReport';

import { Popularity, PopularityTrend, rankChange } from './PopularityChanges';

interface CompareRow { code: string; name: string; strategies: string[]; periods: Record<string, { change: number; rps: number | null } | null>; relative: Record<string, number | null>; industryAsOf: string | null }
interface Comparison { ready: boolean; items: CompareRow[]; popularity: Popularity }
interface Summary { horizon: number; sample: number; total: number; pending: number; missing: number; inactive: number; average: number | null; median: number | null; riseRate: number | null }
interface Observation { date: string; code: string; name: string; environment: string; outcomes: Record<string, { date: string | null; value: number | null; state: string }> }
interface Performance { readyDays: number; expectedDays: number; version: string; summary: Summary[]; groups: { name: string; summary: Summary[] }[]; items: Observation[]; sectorSnapshots: { date: string; asOf: string | null }[] }
function orderedRows<T extends { code?: string; tsCode?: string; date?: string }>(sorted: T[] | null, rows: T[]) {
  const key = (r: T) => [r.tsCode || r.code, r.date].join(':');
  const order = new Map(sorted?.map((r, i) => [key(r), i]));
  return [...rows].sort((a, b) => (order.get(key(a)) ?? Infinity) - (order.get(key(b)) ?? Infinity));
}
const change = (v?: number | null) => <span className={changeClass(v)}>{numberText(v, 2, true)}</span>;
function ComparisonHeading({ title, unit }: { title: string; unit: string }) {
  return (
    <span className="strategy-column-title">
      {title}
      <small>{unit}</small>
    </span>
  );
}
function PanelState({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return (
    <>
      {error && <Alert className="mb-16" type="error" message={error} action={<Button onClick={retry}>重试</Button>} />}
      {loading && <Loading height={280} />}
    </>
  );
}

export function CandidateComparison({
  date, candidates, allCandidates = candidates, strategies, onStock, active = true, loadingCandidates = false,
}: { date: string; candidates: any[]; allCandidates?: any[]; strategies: { key: string; label: string }[]; onStock: (row: any, rows: any[]) => void; active?: boolean; loadingCandidates?: boolean }) {
  const state = useInsight<Comparison>('candidate-comparison', { date, codes: allCandidates.map((r) => r.tsCode).sort() }, active && allCandidates.length > 0);
  const [hotCode, setHotCode] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [period, setPeriod] = useState(20);
  const sortedRows = useRef<any[] | null>(null);
  const details = new Map(state.data?.items.map((r) => [r.code, r]) || []);
  const hot = new Map(state.data?.popularity.items.map((r) => [r.code, r]) || []);
  const rows = candidates.map((r) => ({ ...r, detail: details.get(r.tsCode), hot: hot.get(r.tsCode) })).sort((a, b) => (b.detail?.periods[period]?.rps ?? -1) - (a.detail?.periods[period]?.rps ?? -1)).filter((r) => selected.every((s) => r.detail?.strategies.includes(s)));
  const strategyTags = (keys: string[]) => keys.map((key) => <Tag key={key}>{strategies.find((s) => s.key === key)?.label || key}</Tag>);
  return (
    <div className="strategy-insight-panel">
      <div className="strategy-comparison-controls">
        <Space>
          <span>比较周期</span>
          <Segmented aria-label="比较周期" value={period} onChange={(v) => setPeriod(Number(v))} options={[{ label: '20日', value: 20 }, { label: '60日', value: 60 }]} />
        </Space>
        <Select className="strategy-comparison-select" aria-label="多策略交集" placeholder="同时命中策略（标准参数）" mode="multiple" allowClear maxTagCount="responsive" value={selected} onChange={setSelected} options={strategies.map((s) => ({ value: s.key, label: s.label }))} />
        <HelpTooltip label="横向比较口径" title="涨幅强度表示同期涨幅在全市场有效样本中的百分位（0–100），数值越高，相对排名越靠前。领先行业为个股涨幅减同花顺行业指数涨幅。多策略命中按标准参数计算。" />
      </div>
      <p className="strategy-caption">默认按涨幅强度排序，数值越高，同期涨幅在全市场的排名越靠前。</p>
      {state.data && !state.data.ready && <Alert className="mb-16" type="info" message="观察数据待补齐，候选列表仍可查看。" />}
      <Table
        loading={state.loading || loadingCandidates}
        onChange={(_p, _f, _s, extra) => { sortedRows.current = extra.currentDataSource; }}
        rowKey="tsCode"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        maxBodyHeight={520}
        minBodyHeight={160}
        bottomSpacing={8}
        columns={[
          {
            title: '股票', key: 'stock', fixed: 'left', width: 180, render: (_, r) => <StockLink code={r.tsCode} name={r.name} label={`${r.name} ${r.tsCode.split('.')[0]}`} date={date} onChart={() => onStock(r, orderedRows(sortedRows.current, rows))} />,
          },
          { title: '所属行业', dataIndex: 'industry', width: 110 },
          {
            title: '当日涨跌(%)', dataIndex: 'pctChg', width: 120, align: 'right', sorter: (a, b) => Number(a.pctChg) - Number(b.pctChg), render: change,
          },
          {
            title: `${period}日涨跌(%)`, key: 'period', width: 120, align: 'right', sorter: (a, b) => (a.detail?.periods[period]?.change ?? -Infinity) - (b.detail?.periods[period]?.change ?? -Infinity), render: (_, r) => change(r.detail?.periods[period]?.change),
          },
          {
            title: <ComparisonHeading title={`${period}日涨幅强度`} unit="0–100" />,
            key: 'rps',
            width: 160,
            align: 'right',
            defaultSortOrder: 'descend',
            sorter: (a, b) => (a.detail?.periods[period]?.rps ?? -1) - (b.detail?.periods[period]?.rps ?? -1),
            render: (_, r) => numberText(r.detail?.periods[period]?.rps),
          },
          {
            title: <ComparisonHeading title={`${period}日领先行业`} unit="百分点" />,
            key: 'relative',
            width: 160,
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
            title: '同时符合的标准策略',
            key: 'hits',
            width: 300,
            render: (_, r) => {
              const keys: string[] = r.detail?.strategies || [];
              return keys.length ? (
                <div className="strategy-comparison-hits">
                  {strategyTags(keys.slice(0, 2))}
                  {keys.length > 2 && <Popover trigger={['hover', 'click']} title="同时符合的标准策略" content={<Space direction="vertical">{strategyTags(keys)}</Space>}><InteractionButton intent="popover">{`+${keys.length - 2}`}</InteractionButton></Popover>}
                </div>
              ) : '—';
            },
          },
          {
            title: '同花顺人气',
            key: 'rank',
            width: 150,
            align: 'right',
            render: (_, r) => {
              if (r.hot) {
                return (
                  <div>
                    <InteractionButton intent="preview" onClick={() => setHotCode(r.tsCode)}>{`第${r.hot.rank}名`}</InteractionButton>
                    <div className="strategy-comparison-rank-change">
                      较上日
                      {rankChange(r.hot)}
                    </div>
                  </div>
                );
              } return state.data?.popularity.complete ? '未入榜' : '榜单缺失';
            },
          },
        ]}
      />
      <PopularityTrend date={date} code={hotCode} onClose={() => setHotCode(undefined)} />
      <PanelState loading={false} error={state.error} retry={state.retry} />
    </div>
  );
}

interface PerformanceProps { date: string; strategy: string; sector?: string; onStock: (row: Observation, rows: Observation[]) => void; active?: boolean }

function LiveSignalPerformance({
  date, strategy, sector, onStock, active = true, days,
}: PerformanceProps & { days: number }) {
  const sortedRows = useRef<Observation[] | null>(null);
  const [horizon, setHorizon] = useState(5);
  const [filter, setFilter] = useState('valid');
  const state = useInsight<Performance>('performance', {
    date, strategyType: strategy, sector, days,
  }, active && !!strategy);
  const { data } = state;
  const current = data?.summary.find((row) => row.horizon === horizon);
  const filterState = ({ pending: '未到期', inactive: '观察日无成交', missing: '数据不足' } as Record<string, string>)[filter];
  const rows = (data?.items || []).filter((row) => filter === 'all' || (filter === 'valid' ? row.outcomes[horizon].value != null : row.outcomes[horizon].state === filterState));
  const summaryColumns = [
    {
      title: '平均涨跌(%)', dataIndex: 'average', align: 'right' as const, render: change,
    },
    {
      title: '中位数(%)', dataIndex: 'median', align: 'right' as const, render: change,
    },
    {
      title: '上涨比例(%)', dataIndex: 'riseRate', align: 'right' as const, render: (v: number | null) => numberText(v),
    },
    { title: '有效信号数', dataIndex: 'sample', align: 'right' as const },
  ];
  return (
    <div className="strategy-insight-panel">
      <div className="strategy-result-toolbar">
        <Space wrap>
          <Popover
            trigger={['hover', 'click']}
            title="统计口径与数据状态"
            content={(
              <div className="strategy-performance-tip">
                <p>按标准参数统计，不跟随自定义参数或换手率筛选；设有换手率条件的策略默认每天 &gt; 5%。</p>
                <p>涨跌为信号日复权收盘至后续收盘的变化，不含交易成本；同股不同信号日分别计样本。</p>
                <p>上涨比例为收盘上涨的有效信号占比；中位数为样本涨跌的中间水平。</p>
                <p>观察日停牌或无成交的信号不计入有效样本，不顺延观察日期，不按零涨跌计算。</p>
                <p>{data && !state.loading ? `已就绪 ${data.readyDays}/${data.expectedDays} 个信号日；后${horizon}日未到期 ${current?.pending ?? 0} 条，停牌／无成交 ${current?.inactive ?? 0} 条，数据不足 ${current?.missing ?? 0} 条。` : '数据状态在加载完成后显示。'}</p>
                {!!sector && <p>行业／概念按各信号日已有成分快照筛选；缺少历史成分的日期不纳入统计。</p>}
              </div>
            )}
          >
            <button type="button" className="help-tooltip-trigger" aria-label="统计口径与数据状态说明" aria-haspopup="dialog">
              <QuestionCircleOutlined aria-hidden />
            </button>
          </Popover>
          <Tag>标准参数</Tag>
          <span>
            统计截至
            {date}
          </span>
        </Space>
      </div>
      {state.loading ? <Loading height={300} /> : data && (
        <div className="strategy-performance-content">
          <div className="strategy-horizon-heading">
            <strong>观察周期</strong>
            <span className="strategy-caption">选择周期查看明细与市场环境比较</span>
          </div>
          <div className="strategy-horizon-cards" role="group" aria-label="信号观察周期">
            {[1, 3, 5, 10].map((period) => {
              const summary = data.summary.find((row) => row.horizon === period);
              return (
                <button
                  key={period}
                  type="button"
                  className={`strategy-horizon-card${horizon === period ? ' is-selected' : ''}`}
                  aria-label={`后${period}个交易日`}
                  aria-pressed={horizon === period}
                  aria-controls="signal-performance-details"
                  onClick={() => setHorizon(period)}
                >
                  <span className="strategy-horizon-title">{`后${period}个交易日`}</span>
                  <span className="strategy-horizon-key-metrics">
                    <span>
                      <span className="strategy-horizon-label">上涨比例</span>
                      <strong>
                        {numberText(summary?.riseRate)}
                        <small>{summary?.riseRate == null ? '' : '%'}</small>
                      </strong>
                    </span>
                    <span>
                      <span className="strategy-horizon-label">涨跌中位数</span>
                      <strong>
                        {change(summary?.median)}
                        <small>{summary?.median == null ? '' : '%'}</small>
                      </strong>
                    </span>
                  </span>
                  <span className="strategy-horizon-secondary">
                    <span>
                      平均涨跌
                      {' '}
                      {change(summary?.average)}
                      {summary?.average == null ? '' : '%'}
                    </span>
                    <span>{`有效信号 ${summary?.sample ?? '—'} 条`}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="strategy-data-status strategy-status-strip">
            <span>
              已就绪
              {data.readyDays}
              /
              {data.expectedDays}
              {' '}
              个信号日
            </span>
            {!!current?.pending && (
            <span>
              未到期
              {current.pending}
              {' '}
              条
            </span>
            )}
            {!!current?.inactive && (
            <span>
              观察日停牌／无成交
              {current.inactive}
              {' '}
              条
            </span>
            )}
            {!!current?.missing && (
            <span>
              数据不足
              {current.missing}
              {' '}
              条
            </span>
            )}
          </div>
          {data && (data.readyDays < data.expectedDays || (current?.missing || 0) > 0) && <Alert className="mb-16" type="warning" showIcon message="部分数据不足，当前统计仅覆盖已有有效样本。" />}
          <div id="signal-performance-details" className="strategy-result-toolbar">
            <strong>
              个股信号明细，后
              {horizon}
              日
            </strong>
            <div className="strategy-status-filter"><Segmented aria-label="信号明细状态" value={filter} onChange={(v) => setFilter(String(v))} options={[{ label: '有效样本', value: 'valid' }, { label: '全部', value: 'all' }, { label: '未到期', value: 'pending' }, { label: '停牌／无成交', value: 'inactive' }, { label: '数据不足', value: 'missing' }]} /></div>
          </div>
          <Table
            onChange={(_p, _f, _s, extra) => { sortedRows.current = extra.currentDataSource; }}
            rowKey={(r) => `${r.date}-${r.code}`}
            virtual
            pagination={false}
            dataSource={rows}
            scroll={{ x: 720 }}
            maxBodyHeight={360}
            minBodyHeight={160}
            bottomSpacing={8}
            locale={{ emptyText: state.loading ? '正在加载历史信号' : '当前范围没有符合条件的信号' }}
            columns={[
              { title: '信号日期', dataIndex: 'date', width: 130 },
              {
                title: '股票', key: 'stock', width: 210, render: (_, r) => <StockLink code={r.code} name={r.name} label={`${r.name} ${r.code.split('.')[0]}`} date={r.date} onChart={() => onStock(r, orderedRows(sortedRows.current, rows))} />,
              },
              {
                title: '观察截至', key: 'end', width: 150, render: (_, r) => r.outcomes[horizon].date || '未到期',
              },
              {
                title: `后${horizon}日涨跌(%)`, key: 'return', width: 180, align: 'right', sorter: (a, b) => (a.outcomes[horizon].value ?? -Infinity) - (b.outcomes[horizon].value ?? -Infinity), render: (_, r) => (r.outcomes[horizon].value == null ? <span className="strategy-caption">{r.outcomes[horizon].state}</span> : change(r.outcomes[horizon].value)),
              },
            ]}
          />
          <Collapse
            className="strategy-performance-analysis"
            items={[
              {
                key: 'environment',
                label: `按信号日市场环境比较，后${horizon}日`,
                children: (
                  <>
                    <p className="strategy-caption">按信号当天全市场20日均线上方股票占比分组；样本数随观察周期变化。</p>
                    <CompactTable rowKey="name" pagination={false} scroll={{ x: 680 }} dataSource={data.groups.map((g) => ({ name: ({ 多数站上MA20: '20日均线上方占比 ≥ 50%', 少数站上MA20: '20日均线上方占比 < 50%' } as Record<string, string>)[g.name] || '环境数据缺失', ...g.summary.find((r) => r.horizon === horizon) })).filter((g) => (g.sample ?? 0) > 0)} columns={[{ title: '信号日市场环境', dataIndex: 'name' }, ...summaryColumns]} />
                  </>
                ),
              },
            ]}
          />
        </div>
      )}
      <PanelState loading={false} error={state.error} retry={state.retry} />
    </div>
  );
}

export function SignalPerformance({
  date, strategy, sector, onStock, active = true,
}: PerformanceProps) {
  const [range, setRange] = useState<number | string>('snapshot');
  return (
    <div className="strategy-insight-panel">
      <div className="strategy-result-toolbar">
        <strong>历史信号表现</strong>
        <Segmented aria-label="信号统计范围" value={range} onChange={setRange} options={[{ label: '近20个交易日', value: 20 }, { label: '近60个交易日', value: 60 }, { label: '250日固定报告', value: 'snapshot' }]} />
      </div>
      {range === 'snapshot' ? <StudyReport strategy={strategy} active={active} onStock={onStock} /> : <LiveSignalPerformance date={date} strategy={strategy} sector={sector} onStock={onStock} active={active} days={Number(range)} />}
    </div>
  );
}
