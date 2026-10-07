'use client';

import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Button, Grid, Input, Popover, Segmented, Select, Space, Tabs, Tag,
} from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { InteractionButton } from '@/components/Interaction';
import Table from '@/components/DataTable';
import Loading from '@/components/Loading';
import { changeClass, numberText } from '@/utils/format';

const BASE = '/strategy-study/2026-09-30';
const horizons = [1, 3, 5, 10];
interface Distribution { sample: number; average: number | null; median: number | null }
interface Summary extends Distribution {
  horizon: number; total: number; riseRate: number | null; confidence: number[] | null;
  pending: number; inactive: number; missing: number; paired: number; benchmarkMissing: number;
  benchmark: Distribution; excess: Distribution; outperformRate: number | null;
}
interface Outcome { date: string | null; value: number | null; benchmark: number | null; excess: number | null; state: string; reason: string | null }
interface Signal { date: string; code: string; name: string; outcomes: Record<string, Outcome> }
interface Extreme extends Outcome { code: string; name: string }
interface StockAverage { code: string; name: string; first: string; last: string; sample: number; average: number | null; median: number | null; riseRate: number | null; excessAverage: number | null; excessMedian: number | null; outperformRate: number | null }
interface StrategyReport {
  key: string; label: string; signals: number; stocks: number; summary: Summary[];
  coverage: { readyDays: number; expectedDays: number; missingDates: { date: string; reason: string }[] };
  screeningMissing: { count: number; reasons: Record<string, number> };
  monthly: { month: string; signals: number; summary: Summary[] }[];
  extrema: { horizon: number; best: Extreme | null; worst: Extreme | null }[];
}
interface Report {
  version: string; generatedAt: string; sourceAsOf: string; start: string; end: string; days: number; signals: number; universe: number;
  benchmark: { code: string; name: string }; sourceHash: string; ruleHash: string;
  quality: { dailyReady: number; factorReady: number; missingDaily: string[]; missingFactors: string[]; benchmarkMissing: string[]; screeningMissing: number; identityAsOf: string };
  strategies: StrategyReport[];
}
interface Details { version: string; items: Signal[]; rankings: Record<string, StockAverage[]>; screeningMissing: { date: string; code: string; reason: string }[] }
interface Peak { kind: string; code: string; name: string; date: string; value: number | null; excess: number | null; sample?: number }
const changed = (value: number | null) => <span className={changeClass(value)}>{numberText(value, 2, true)}</span>;
const rate = (value: number | null) => (value == null ? '—' : `${numberText(value)}%`);
const interval = (value: number[] | null) => (value ? `${numberText(value[0])}%～${numberText(value[1])}%` : '—');
const states: Record<string, string> = {
  valid: '有效', pending: '未到期', inactive: '停牌／无成交', missing: '数据不足',
};
function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((row) => row.map((value) => {
    const text = value == null ? '' : String(value);
    const safe = typeof value === 'string' && /^[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const metricColumns = [
  {
    title: '上涨比例', dataIndex: 'riseRate', width: 115, align: 'right' as const, render: rate, sorter: (a: Summary, b: Summary) => (a.riseRate ?? -Infinity) - (b.riseRate ?? -Infinity),
  },
  {
    title: '涨跌中位数(%)', dataIndex: 'median', width: 125, align: 'right' as const, render: changed,
  },
  {
    title: '平均涨跌(%)', dataIndex: 'average', width: 125, align: 'right' as const, render: changed,
  },
  {
    title: '跑赢上证比例', dataIndex: 'outperformRate', width: 125, align: 'right' as const, render: rate,
  },
  {
    title: '平均超额(百分点)', key: 'excessAverage', width: 150, align: 'right' as const, render: (_: unknown, row: Summary) => changed(row.excess.average),
  },
  {
    title: '超额中位数(百分点)', key: 'excessMedian', width: 155, align: 'right' as const, render: (_: unknown, row: Summary) => changed(row.excess.median),
  },
  {
    title: '有效样本', dataIndex: 'sample', width: 100, align: 'right' as const,
  },
];

export default function StudyReport({ strategy, active, onStock }: { strategy: string; active: boolean; onStock: (row: any, rows: any[]) => void }) {
  const screens = Grid.useBreakpoint();
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [focus, setFocus] = useState(strategy);
  const [horizon, setHorizon] = useState(5);
  const [view, setView] = useState('comparison');
  const [details, setDetails] = useState<Details>();
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [filter, setFilter] = useState('valid');
  const [month, setMonth] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [ranking, setRanking] = useState('signal');
  const [minimum, setMinimum] = useState(5);
  const cached = useRef(new Map<string, Details>());
  useEffect(() => { setFocus(strategy); }, [strategy]);
  useEffect(() => {
    if (!active || report) return undefined;
    const controller = new AbortController();
    setError('');
    fetch(`${BASE}/summary.json`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('固定报告加载失败，请重试');
      const value: Report = await response.json();
      if (!value.version || value.days !== 250 || value.strategies.length !== 9) throw new Error('固定报告结构异常');
      setReport(value);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [active, report, retry]);
  useEffect(() => {
    setDetails(cached.current.get(focus));
    setDetailError('');
    if (!active || !report || !['stocks', 'signals'].includes(view) || cached.current.has(focus)) { setLoadingDetails(false); return undefined; }
    const controller = new AbortController();
    setLoadingDetails(true);
    const compressed = typeof DecompressionStream !== 'undefined';
    fetch(`${BASE}/${focus}.json${compressed ? '.gz' : ''}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('信号明细加载失败，请重试');
      const value: Details = compressed && response.body ? await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json() : await response.json();
      if (value.version !== report.version) throw new Error('报告与明细版本不一致，请刷新页面');
      cached.current.set(focus, value);
      setDetails(value);
    }).catch((failure) => { if (!controller.signal.aborted) setDetailError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoadingDetails(false); });
    return () => controller.abort();
  }, [active, focus, report, view, retry]);
  const selected = report?.strategies.find((row) => row.key === focus) || report?.strategies[0];
  const current = selected?.summary.find((row) => row.horizon === horizon);
  const filtered = useMemo(() => (details?.items || []).filter((row) => (month === 'all' || row.date.startsWith(month)) && (filter === 'all' || row.outcomes[horizon].state === filter) && (!keyword || `${row.code} ${row.name}`.toLowerCase().includes(keyword.trim().toLowerCase()))).reverse(), [details, filter, month, horizon, keyword]);
  const single = useMemo(() => (details?.items || []).filter((row) => row.outcomes[horizon].state === 'valid').sort((a, b) => b.outcomes[horizon].value! - a.outcomes[horizon].value!), [details, horizon]);
  const stockAverages = useMemo(() => (details?.rankings[horizon] || []).filter((row) => row.sample >= minimum).sort((a, b) => b.average! - a.average!), [details, horizon, minimum]);
  const preview = (signal: Signal, rows = filtered) => onStock({ ...signal, studyStrategy: focus, environment: '未知' }, rows.map((row) => ({ ...row, studyStrategy: focus, environment: '未知' })));
  if (error) return <Alert type="error" showIcon message={error} action={<Button onClick={() => setRetry((value) => value + 1)}>重试</Button>} />;
  if (!report || !selected || !current) return <Loading height={300} />;
  const comparison = report.strategies.map((row) => ({ ...row.summary.find((item) => item.horizon === horizon)!, key: row.key, label: row.label }));
  const monthly = selected.monthly.map((row) => ({ ...row.summary.find((item) => item.horizon === horizon)!, month: row.month }));
  const extreme = selected.extrema.find((row) => row.horizon === horizon);
  const peaks: Peak[] = ranking === 'signal' ? [...single.slice(0, 5).map((row) => ({
    ...row, kind: '最佳', ...row.outcomes[horizon], date: row.date,
  })), ...single.slice(-5).reverse().map((row) => ({
    ...row, kind: '最差', ...row.outcomes[horizon], date: row.date,
  }))] : [...stockAverages.slice(0, 5).map((row) => ({
    ...row, kind: '最佳', date: row.last, value: row.average, excess: row.excessAverage,
  })), ...stockAverages.slice(-5).reverse().map((row) => ({
    ...row, kind: '最差', date: row.last, value: row.average, excess: row.excessAverage,
  }))];
  const downloadSummary = () => downloadCsv(`250日策略汇总-${report.end}.csv`, [['策略', '观察周期', '信号数', '有效样本', '上涨比例(%)', '上涨比例95%区间下限', '上涨比例95%区间上限', '平均涨跌(%)', '涨跌中位数(%)', '跑赢上证比例(%)', '平均超额(百分点)', '超额中位数(百分点)', '基准有效样本', '未到期', '停牌或无成交', '数据不足', '基准缺失'], ...report.strategies.flatMap((row) => row.summary.map((value) => [row.label, value.horizon, value.total, value.sample, value.riseRate, value.confidence?.[0] ?? null, value.confidence?.[1] ?? null, value.average, value.median, value.outperformRate, value.excess.average, value.excess.median, value.paired, value.pending, value.inactive, value.missing, value.benchmarkMissing]))]);
  const downloadSignals = () => downloadCsv(`${selected.label}-全量信号-${report.end}.csv`, [['策略', '股票代码', '信号日名称', '信号日', '观察周期', '观察日', '涨跌(%)', '上证涨跌(%)', '超额(百分点)', '状态', '说明'], ...(details?.items || []).flatMap((row) => horizons.map((period) => [selected.label, row.code, row.name, row.date, period, row.outcomes[period].date, row.outcomes[period].value, row.outcomes[period].benchmark, row.outcomes[period].excess, states[row.outcomes[period].state], row.outcomes[period].reason]))]);
  return (
    <div className="strategy-study">
      <div className="strategy-result-toolbar">
        <Space wrap>
          <Tag>固定报告</Tag>
          <span>{`${report.start}～${report.end} · ${report.days}个交易日 · 全市场`}</span>
          <Popover
            trigger={['hover', 'click']}
            title="250日统计口径"
            content={(
              <div className="strategy-performance-tip">
                <p>按当前默认规则逐日重新筛选，全量考虑当时上市的股票；前七个策略按形态日自由流通换手率 &gt; 5%，其余两项沿用各自默认条件。</p>
                <p>每个“策略 × 股票 × 信号日”独立计样本。收益为信号日复权收盘至第N个市场交易日复权收盘的涨跌，不含交易成本。</p>
                <p>相对上证指数为同期股票涨跌减指数涨跌，单位为百分点；跑赢比例仅使用双方行情有效的配对样本。持平不计上涨或跑赢。</p>
                <p>停牌／无成交单列，不顺延观察日、不按零收益处理。未到期和缺失不参与有效样本统计。</p>
                <p>上涨比例使用95% Wilson置信区间，按你指定的独立信号口径计算，不调整同股或同日信号的相关性。</p>
                <p>月度按信号日分组，首尾月份可能不满月。固定报告不随上方交易日期、行业或自定义参数改变。</p>
              </div>
          )}
          >
            <button type="button" className="help-tooltip-trigger" aria-label="250日统计口径说明" aria-haspopup="dialog"><QuestionCircleOutlined aria-hidden /></button>
          </Popover>
        </Space>
        <Button size="small" onClick={downloadSummary}>下载全部策略汇总</Button>
      </div>
      <div className="strategy-study-selection">
        <Space wrap>
          <strong>报告策略</strong>
          <Select aria-label="报告策略" value={selected.key} onChange={setFocus} options={report.strategies.map((row) => ({ value: row.key, label: row.label }))} />
        </Space>
        <span className="strategy-caption">{`${selected.signals.toLocaleString()}次信号 · ${selected.stocks.toLocaleString()}只股票 · 基准：上证指数`}</span>
      </div>
      {(selected.coverage.readyDays < 250 || selected.screeningMissing.count > 0) && <Alert type="warning" showIcon message={`筛选覆盖 ${selected.coverage.readyDays}/250 个交易日；${selected.screeningMissing.count}个候选因历史数据不足无法判定，详见“数据核查”。`} />}
      <div className="strategy-horizon-cards" role="group" aria-label="250日观察周期">
        {selected.summary.map((row) => (
          <button key={row.horizon} type="button" className={`strategy-horizon-card${horizon === row.horizon ? ' is-selected' : ''}`} aria-label={`250日后${row.horizon}个交易日`} aria-pressed={horizon === row.horizon} onClick={() => setHorizon(row.horizon)}>
            <span className="strategy-horizon-title">{`后${row.horizon}个交易日`}</span>
            <span className="strategy-horizon-key-metrics">
              <span>
                <span className="strategy-horizon-label">上涨比例</span>
                <strong>
                  {numberText(row.riseRate)}
                  <small>{row.riseRate == null ? '' : '%'}</small>
                </strong>
              </span>
              <span>
                <span className="strategy-horizon-label">涨跌中位数</span>
                <strong>
                  {changed(row.median)}
                  <small>{row.median == null ? '' : '%'}</small>
                </strong>
              </span>
            </span>
            <span className="strategy-horizon-secondary">
              <span>{`平均涨跌 ${row.average == null ? '—' : `${numberText(row.average, 2, true)}%`}`}</span>
              <span>{`有效 ${row.sample.toLocaleString()} 次`}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="strategy-study-benchmark">
        <span>
          <span>跑赢上证比例</span>
          <strong>{rate(current.outperformRate)}</strong>
        </span>
        <span>
          <span>平均超额（百分点）</span>
          <strong>{changed(current.excess.average)}</strong>
        </span>
        <span>
          <span>超额中位数（百分点）</span>
          <strong>{changed(current.excess.median)}</strong>
        </span>
        <span>
          <span>上涨比例95%区间</span>
          <strong>{interval(current.confidence)}</strong>
        </span>
      </div>
      <div className="strategy-status-strip strategy-caption">
        <span>{`有效 ${current.sample.toLocaleString()} · 未到期 ${current.pending} · 停牌／无成交 ${current.inactive} · 缺失 ${current.missing}`}</span>
        <span>{`上证配对 ${current.paired.toLocaleString()} · 基准缺失 ${current.benchmarkMissing}`}</span>
      </div>
      <div className="strategy-study-extremes">
        {[['best', '单次最佳'], ['worst', '单次最差']].map(([key, label]) => {
          const row = extreme?.[key as 'best' | 'worst'];
          return (
            <span key={key}>
              <span>{label}</span>
              <strong>{row ? `${row.name} ${row.code.split('.')[0]}` : '—'}</strong>
              <span>
                {changed(row?.value ?? null)}
                {row?.value == null ? '' : '%'}
              </span>
              <small>{row ? `信号日 ${selected.extrema.find((item) => item.horizon === horizon)?.[key as 'best' | 'worst']?.date}` : ''}</small>
            </span>
          );
        })}
      </div>
      <Tabs
        activeKey={view}
        onChange={setView}
        items={[
          { key: 'comparison', label: '全部策略对比' }, { key: 'monthly', label: '按月表现' }, { key: 'stocks', label: '最佳／最差个股' }, { key: 'signals', label: '全量信号明细' }, { key: 'quality', label: '数据核查' },
        ]}
      />
      {detailError && <Alert type="error" message={detailError} action={<Button onClick={() => setRetry((value) => value + 1)}>重试</Button>} />}
      {view === 'comparison' && (
      <Table
        autoHeight
        pagination={false}
        rowKey="key"
        dataSource={comparison}
        scroll={{ x: 1360 }}
        rowClassName={(row) => (row.key === selected.key ? 'interaction-selected-row' : '')}
        columns={[
          {
            title: `策略 · 后${horizon}日`, key: 'strategy', width: 280, fixed: screens.md ? 'left' : undefined, render: (_, row) => <InteractionButton intent="select" selected={row.key === selected.key} onClick={() => setFocus(row.key)}>{row.label}</InteractionButton>,
          }, ...metricColumns,
          {
            title: '上涨比例95%区间', dataIndex: 'confidence', width: 180, align: 'right', render: interval,
          },
        ]}
      />
      )}
      {view === 'monthly' && (
      <>
        <p className="strategy-caption">按信号日所在月份分组，点击月份查看该月信号；首尾月份仅包含本报告范围内的交易日。</p>
        <Table
          autoHeight
          pagination={false}
          rowKey="month"
          dataSource={monthly}
          scroll={{ x: 1310 }}
          columns={[
            {
              title: `信号月份 · 后${horizon}日`, dataIndex: 'month', width: 150, fixed: screens.md ? 'left' : undefined, render: (value) => <InteractionButton intent="select" onClick={() => { setMonth(value); setView('signals'); }}>{value}</InteractionButton>,
            }, ...metricColumns,
            {
              title: '上涨比例95%区间', dataIndex: 'confidence', width: 180, align: 'right', render: interval,
            },
          ]}
        />
      </>
      )}
      {view === 'stocks' && (
      <>
        <div className="strategy-result-toolbar">
          <Segmented aria-label="个股排名口径" value={ranking} onChange={(value) => setRanking(String(value))} options={[{ label: '单次信号', value: 'signal' }, { label: '个股平均', value: 'average' }]} />
          {ranking === 'average' && (
          <Space>
            <span>至少有效信号</span>
            <Select aria-label="个股最少有效信号数" value={minimum} onChange={setMinimum} options={[1, 3, 5, 10].map((value) => ({ value, label: `${value}次` }))} />
          </Space>
          )}
        </div>
        <p className="strategy-caption">{ranking === 'signal' ? '按单次信号涨跌分别取最佳、最差各5次。' : `按个股所有有效信号的平均涨跌排名，仅展示至少${minimum}次有效信号的股票；全部股票仍参与策略汇总。`}</p>
        <Table
          autoHeight
          loading={loadingDetails}
          pagination={false}
          rowKey={(row) => `${row.kind}-${row.code}-${row.date}`}
          dataSource={peaks}
          scroll={{ x: 780 }}
          columns={[
            { title: '排名', dataIndex: 'kind', width: 70 }, { title: '股票', width: 180, render: (_, row) => `${row.name} ${row.code.split('.')[0]}` },
            { title: ranking === 'signal' ? '信号日期' : '最近信号日', dataIndex: 'date', width: 130 },
            {
              title: ranking === 'signal' ? '涨跌(%)' : '平均涨跌(%)', dataIndex: 'value', align: 'right', width: 120, render: changed,
            },
            {
              title: '超额(百分点)', dataIndex: 'excess', width: 135, align: 'right', render: changed,
            },
            {
              title: '有效信号数', key: 'sample', width: 110, align: 'right', render: (_, row) => row.sample ?? 1,
            },
          ]}
        />
      </>
      )}
      {view === 'signals' && (
      <>
        <div className="strategy-result-toolbar">
          <Space wrap>
            <Input aria-label="报告股票搜索" placeholder="股票代码／名称" value={keyword} onChange={(event) => setKeyword(event.target.value)} allowClear />
            <Select aria-label="信号月份" value={month} onChange={setMonth} options={[{ value: 'all', label: '全部月份' }, ...selected.monthly.map((row) => ({ value: row.month, label: row.month }))]} />
            <Select aria-label="报告信号状态" value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部状态' }, ...Object.entries(states).map(([value, label]) => ({ value, label }))]} />
          </Space>
          <Button size="small" disabled={!details || loadingDetails} onClick={downloadSignals}>下载当前策略全量明细</Button>
        </div>
        <Table
          loading={loadingDetails}
          rowKey={(row) => `${row.code}-${row.date}`}
          dataSource={filtered}
          maxBodyHeight={480}
          minBodyHeight={260}
          pagination={{
            defaultPageSize: 20, pageSizeOptions: [20, 50, 100], showSizeChanger: true, showTotal: (total) => `共 ${total.toLocaleString()} 次信号`,
          }}
          scroll={{ x: 1000 }}
          columns={[
            { title: '信号日期', dataIndex: 'date', width: 130 }, { title: '股票', width: 200, render: (_, row) => <InteractionButton intent="preview" onClick={() => preview(row)}>{`${row.name} ${row.code.split('.')[0]}`}</InteractionButton> },
            { title: '观察日期', width: 130, render: (_, row) => row.outcomes[horizon].date || '未到期' },
            {
              title: `后${horizon}日涨跌(%)`, width: 140, align: 'right', sorter: (a, b) => (a.outcomes[horizon].value ?? -Infinity) - (b.outcomes[horizon].value ?? -Infinity), render: (_, row) => changed(row.outcomes[horizon].value),
            },
            {
              title: '上证涨跌(%)', width: 130, align: 'right', render: (_, row) => changed(row.outcomes[horizon].benchmark),
            },
            {
              title: '超额(百分点)', width: 140, align: 'right', render: (_, row) => changed(row.outcomes[horizon].excess),
            },
            { title: '状态', width: 200, render: (_, row) => row.outcomes[horizon].reason || states[row.outcomes[horizon].state] },
          ]}
        />
      </>
      )}
      {view === 'quality' && (
      <div className="strategy-study-quality">
        <p>{`${report.strategies.length}个策略 · ${report.signals.toLocaleString()}次独立信号 · ${report.universe.toLocaleString()}只涉及股票。`}</p>
        <p>{`信号范围 ${report.start}～${report.end}，使用额外122个交易日作形态和均线预热；历史身份快照 ${report.quality.identityAsOf}。`}</p>
        <Table
          autoHeight
          pagination={false}
          rowKey="key"
          dataSource={report.strategies}
          columns={[
            { title: '策略', dataIndex: 'label' }, { title: '筛选覆盖', render: (_, row) => `${row.coverage.readyDays}/${row.coverage.expectedDays}日` },
            { title: '无法判定的候选', render: (_, row) => row.screeningMissing.count },
            { title: '后续行情缺失', render: (_, row) => row.summary.find((item) => item.horizon === horizon)?.missing },
          ]}
        />
        <p>{`当前策略：未到期 ${current.pending}，停牌／无成交 ${current.inactive}，后续数据缺失 ${current.missing}，上证配对缺失 ${current.benchmarkMissing}。`}</p>
        {selected.screeningMissing.count > 0 && <p>{Object.entries(selected.screeningMissing.reasons).map(([reason, count]) => `${reason} ${count}次`).join('；')}</p>}
        {selected.coverage.missingDates.length > 0 && <p>{`未覆盖日期：${selected.coverage.missingDates.map((row) => row.date).join('、')}`}</p>}
        <Space wrap>
          <a href={`${BASE}/summary.json`} download>下载完整统计快照</a>
          <a href={`${BASE}/validation.json`} download>下载核查结果</a>
          <a href={`${BASE}/${selected.key}.json`} download>下载信号与候选缺失记录</a>
        </Space>
        <p className="strategy-caption">{`报告版本 ${report.version} · 生成时间 ${report.generatedAt.slice(0, 10)} · 数据指纹 ${report.sourceHash.slice(0, 12)} · 规则指纹 ${report.ruleHash.slice(0, 12)}`}</p>
      </div>
      )}
    </div>
  );
}
