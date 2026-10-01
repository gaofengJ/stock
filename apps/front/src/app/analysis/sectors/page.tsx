'use client';

import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Alert, Button, Card, Col, Empty, Input, Row, Segmented, Space, Tabs, Popover,
} from 'antd';
import { SectorBoard, SectorMember, SectorRow } from '@/api/sectors';
import { StrategySignals } from '@/api/market';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { changeClass, numberText, scaledNumber } from '@/utils/format';
import Table from '@/components/DataTable';
import CChart from '@/components/CChart';
import { useSiteTheme } from '@/components/SiteTheme';
import { quoteColors, withAlpha } from '@/colors';
import HelpTooltip from '@/components/HelpTooltip';
import SectorLinks from '@/components/SectorLinks';
import MarketShell from '../components/MarketShell';
import { useMarket } from '../components/MarketContext';
import useMarketData from '../components/useMarketData';
import { DataState, SectionTitle } from '../components/MarketCharts';
import IndexChart from '../components/IndexChart';
import ChartRange from '../components/ChartRange';
import { ChartWindow } from '../components/market-display';
import { marketHref } from '../components/market-navigation';
import './sectors.sass';

export default function Page() {
  const { date } = useMarket(); const params = useSearchParams(); const router = useRouter(); const { user } = useAccount();
  const kind = params.get('kind') === 'N' ? 'N' : 'I';
  const code = /^88[156]\d{3}\.TI$/.test(params.get('code') || '') ? params.get('code') || undefined : undefined;
  const [keyword, setKeyword] = useState(''); const [period, setPeriod] = useState<1 | 5 | 20>(1);
  const [window, setWindow] = useState<ChartWindow>({ period: 'day', count: 60 });
  const { colors } = useSiteTheme(); const detailRef = useRef<HTMLDivElement>(null);
  const request = useMarketData<SectorBoard>('sectors', {
    kind, code, period, days: 730, scope: 'all',
  });
  const signals = useMarketData<StrategySignals & { date: string; counts: { code: string; count: number; strategies: { key: string; count: number }[] }[] }>('sector-signals', { scope: 'all', days: 20 }, allowedPath(user, '/strategy'));
  const signalsReady = !signals.loading && !signals.error && signals.data?.date === date && signals.data.readyDates.includes(date);
  const counts = new Map(signals.data?.counts.map((r) => [r.code, r]) || []);
  const strategyLabels = new Map(signals.data?.strategies.map((r) => [r.key, r.label]) || []);
  const stockSignals = new Map(signals.data?.items.map((r) => [r.tsCode, r.strategies]) || []);
  const strategyHref = (strategyType: string, sectorCode: string, stockCode?: string) => `/strategy/?${new URLSearchParams({
    date, sector: sectorCode, strategyType, ...(stockCode ? { code: stockCode } : {}),
  })}`;
  const dragon = useMarketData<{codes:string[]}>('dragon-list', { scope: 'all' });
  const dragonCodes = useMemo(() => new Set(dragon.data?.codes || []), [dragon.data?.codes]);
  const { retry } = request;
  const data = request.data?.date === date && request.data.kind === kind && request.data.period === period ? request.data : null;
  const jobStatus = data?.job?.status;
  useEffect(() => { if (code && data?.detail?.code === code) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [code, data?.detail?.code]);
  useEffect(() => {
    if (!jobStatus || ['success', 'failed'].includes(jobStatus)) return undefined;
    const timer = setInterval(() => { if (!document.hidden) retry(); }, 30000);
    return () => clearInterval(timer);
  }, [jobStatus, retry]);
  const periodField = ({ 1: 'day', 5: 'five', 20: 'twenty' } as const)[period];
  const ranked = useMemo(() => [...(data?.items || [])].sort((a, b) => (b[periodField] ?? -Infinity) - (a[periodField] ?? -Infinity) || a.code.localeCompare(b.code)), [data?.items, periodField]);
  const rows = ranked.filter((r) => `${r.name} ${r.code}`.includes(keyword.trim()));
  const rotation = data?.rotation || [];
  const rotationRows = rows.slice(0, 12);
  const metric = (v: number | null) => (
    <span className={changeClass(v)}>
      {numberText(v, 2, true)}
      {v == null ? '' : '%'}
    </span>
  );
  const open = (r: SectorRow) => router.push(marketHref('/analysis/sectors', { date, scope: 'all' }, { kind, code: r.code }), { scroll: false });
  const jump = (path: string, sector: string, extra: Record<string, string> = {}) => marketHref(path, { date, scope: 'all' }, { sector, ...extra });
  const detail = code && data?.detail?.code === code ? data.detail : null;
  const rotationOptions = {
    tooltip: { position: 'top', renderMode: 'richText', formatter: (p:any) => { const cell = data!.rotation[p.value[0]]; const row = rotationRows[p.value[1]]; const value = cell.values.find((v) => v.code === row.code); return `${cell.date}\n${row.name}\n${period === 1 ? '当日' : `${period}日`}涨跌幅 ${numberText(value?.value, 2, true)}%\n排名 ${value?.rank ?? '—'}／${cell.total}`; } },
    grid: {
      top: 16, left: 130, right: 36, bottom: 85,
    },
    xAxis: {
      type: 'category', data: rotation.map((r) => r.date), splitArea: { show: true }, axisLabel: { formatter: (v:string) => v.slice(5), rotate: 35 }, axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'category', data: rotationRows.map((r) => r.name), inverse: true, splitArea: { show: true }, axisTick: { show: false },
    },
    visualMap: {
      textStyle: { color: colors.secondary },
      min: 0,
      max: 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      text: ['排名靠前', '排名靠后'],
      inRange: { color: [withAlpha(colors.secondary, 0.05), withAlpha(quoteColors.up, 0.3), quoteColors.up] },
      calculable: false,
      show: true,
    },
    series: [{
      type: 'heatmap', data: rotation.flatMap((cell, x) => rotationRows.flatMap((row, y) => { const rank = cell.values.find((v) => v.code === row.code)?.rank; return rank == null ? [] : [[x, y, cell.total > 1 ? 1 - (rank - 1) / (cell.total - 1) : 1]]; })), label: { show: true, color: colors.text, formatter: (p:any) => String(rotation[p.value[0]].values.find((v) => v.code === rotationRows[p.value[1]].code)?.rank ?? '') }, itemStyle: { borderWidth: 2, borderColor: colors.surface }, emphasis: { itemStyle: { borderWidth: 2, borderColor: colors.primary } },
    }],
  };
  const tableColumns = [
    {
      title: '板块', dataIndex: 'name', fixed: 'left' as const, width: 160, render: (v: string, r: SectorRow) => <Button type="link" className="sector-name-link" onClick={() => open(r)}>{v}</Button>,
    },
    ...(['day', 'five', 'twenty'] as const).map((field, i) => ({
      title: ['当日涨跌幅', '5日涨跌幅', '20日涨跌幅'][i], dataIndex: field, align: 'right' as const, width: 135, render: metric, sorter: (a:SectorRow, b:SectorRow) => (a[field] ?? -Infinity) - (b[field] ?? -Infinity),
    })),
    {
      title: '上涨占比', dataIndex: 'upRatio', align: 'right' as const, width: 110, render: (v: number | null) => `${numberText(v)}${v == null ? '' : '%'}`,
    },
    {
      title: '涨停家数',
      dataIndex: 'limitUp',
      align: 'right' as const,
      width: 100,
      render: (v: number | null, r: SectorRow) => {
        if (v == null) return '—';
        if (v > 0 && allowedPath(user, '/analysis/limits')) return <Link href={jump('/analysis/limits', r.code, { type: 'U' })}>{v}</Link>;
        return v;
      },
    },
    {
      title: '成交额(亿元)', dataIndex: 'amount', align: 'right' as const, width: 135, render: (v: number | null) => numberText(v),
    },
    {
      title: (
        <span>
          成交额占比
          <HelpTooltip label="成交额占比" title="成分股成交额占全部A股比例；题材成分可重叠，不能相加。" />
        </span>
      ),
      dataIndex: 'amountShare',
      align: 'right' as const,
      width: 130,
      render: (v: number | null) => `${numberText(v)}${v == null ? '' : '%'}`,
    },
    {
      title: '最高连板', dataIndex: 'maxHeight', align: 'right' as const, width: 100, render: (v: number | null, r: SectorRow) => (v && allowedPath(user, '/analysis/chains') ? <Link href={jump('/analysis/chains', r.code)}>{v}</Link> : v ?? '—'),
    },
    ...(allowedPath(user, '/strategy') ? [{
      title: (
        <span>
          策略命中
          <HelpTooltip label="策略命中" title="命中任一现行策略的股票数，同一股票只计一次。" />
        </span>
      ),
      key: 'signals',
      align: 'right' as const,
      width: 130,
      render: (_: unknown, r: SectorRow) => {
        if (!signalsReady) return signals.error ? <Button type="link" onClick={signals.retry}>重试</Button> : '待更新';
        const hit = counts.get(r.code);
        return hit?.count ? (
          <Popover
            title="当日策略命中"
            content={(
              <Space direction="vertical">
                {hit.strategies.map((s) => (
                  <Link key={s.key} href={strategyHref(s.key, r.code)}>
                    {strategyLabels.get(s.key)}
                    ：
                    {s.count}
                    只
                  </Link>
                ))}
              </Space>
)}
          >
            <Button type="link">{hit.count}</Button>
          </Popover>
        ) : (hit?.count ?? '—');
      },
    }] : []),
    {
      title: '有成交／成分', key: 'members', align: 'right' as const, width: 130, render: (_: unknown, r: SectorRow) => (r.memberCount == null ? '—' : `${r.traded ?? '—'}／${r.memberCount}`),
    },
    {
      title: '成分日期', dataIndex: 'asOf', width: 115, render: (v: string | null) => v || '补齐中',
    },
    {
      title: '关联',
      key: 'links',
      width: 175,
      render: (_: unknown, r: SectorRow) => (
        <Space size={10}>
          {allowedPath(user, '/analysis/dragon') && <Link href={jump('/analysis/dragon', r.code)}>龙虎榜</Link>}
          {allowedPath(user, '/strategy') && <Link href={`/strategy/?${new URLSearchParams({ date, sector: r.code })}`}>策略选股</Link>}
        </Space>
      ),
    },
  ];
  return (
    <MarketShell title="板块分析" path="/analysis/sectors" scopeFilter={false}>
      <Tabs activeKey={kind} onChange={(value) => { setKeyword(''); router.replace(marketHref('/analysis/sectors', { date, scope: 'all' }, { kind: value }), { scroll: false }); }} items={[{ key: 'I', label: '行业' }, { key: 'N', label: '题材' }]} />
      <div className="sector-toolbar">
        <Space wrap>
          <Input.Search allowClear aria-label="搜索板块" placeholder="板块名称／代码" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 240 }} />
          <Segmented aria-label="强弱与轮动统计周期" value={period} onChange={(v) => setPeriod(v as 1|5|20)} options={[{ value: 1, label: '当日' }, { value: 5, label: '5日' }, { value: 20, label: '20日' }]} />
          <HelpTooltip label="板块统计" title="涨跌幅采用同花顺指数，上涨占比按有成交成分计算；涨停数沿用非ST口径。" />
        </Space>
        <span>
          {kind === 'I' ? '同花顺行业' : '同花顺概念'}
          {' '}
          -
          {' '}
          {data?.items.length ?? '—'}
          个板块
        </span>
      </div>
      {data?.job && data.job.status !== 'success' && <Alert className="mb-16" type={data.job.status === 'failed' ? 'warning' : 'info'} showIcon message={data.job.status === 'failed' ? '板块数据同步失败，请查看数据同步任务' : `板块数据补齐中：${data.job.stage}`} />}
      <DataState loading={request.loading} error={request.error} retry={request.retry} empty={!data}>
        <SectionTitle title="强弱排行" description="成分统计显示快照日期，不代表历史时点的完整成分。" />
        <Table<SectorRow> rowKey="code" size="small" pagination={false} bordered maxBodyHeight={480} minBodyHeight={280} scroll={{ x: 1730 }} dataSource={rows} columns={tableColumns} rowClassName={(r) => (r.code === code ? 'sector-selected' : '')} locale={{ emptyText: keyword ? '没有符合条件的板块' : '板块目录正在补齐' }} />
        <Row gutter={[16, 16]} className="sector-rotation-row">
          <Col xs={24} xl={24}>
            <Card title={(
              <Space>
                板块轮动
                <HelpTooltip label="板块轮动" title="展示当前排行前12个板块近20个交易日的排名，颜色越深排名越靠前。" />
              </Space>
)}
            >
              {!rotationRows.length ? <Empty description="暂无轮动数据" /> : (
                <CChart
                  height={430}
                  genOptions={() => rotationOptions}
                />
              )}
            </Card>
          </Col>
        </Row>
        <div ref={detailRef} className="sector-detail">
          {!code && <div className="sector-detail-hint">选择板块，查看走势与成分股</div>}
          {code && !detail && !request.loading && <Empty description="所选板块不在当前分类中" />}
          {detail && (
          <>
            <div className="sector-detail-heading">
              <SectionTitle title={detail.name} />
              <Space wrap>
                <Button onClick={() => router.replace(marketHref('/analysis/sectors', { date, scope: 'all' }, { kind }), { scroll: false })}>取消选择</Button>
                <ChartRange value={window} onChange={setWindow} />
              </Space>
            </div>
            <IndexChart index={{ code: detail.code, name: detail.name, series: detail.series }} dates={data!.dates} window={window} />
            <div className="sector-detail-heading">
              <SectionTitle title="成分股" description={`成分截至${detail.asOf || '尚未采集'}，行情为${date}。`} />
              <Space>
                {allowedPath(user, '/basic/stock') && <Link href={`/basic/stock/?sector=${detail.code}&date=${date}`}>基础信息</Link>}
                {allowedPath(user, '/analysis/limits') && <Link href={jump('/analysis/limits', detail.code, { type: 'U' })}>涨停复盘</Link>}
                {allowedPath(user, '/analysis/chains') && <Link href={jump('/analysis/chains', detail.code)}>连板梯队</Link>}
              </Space>
            </div>
            <Table<SectorMember>
              rowKey="tsCode"
              size="small"
              bordered
              pagination={false}
              maxBodyHeight={480}
              minBodyHeight={280}
              scroll={{ x: 1430 }}
              dataSource={detail.members}
              columns={[
                { title: '代码', dataIndex: 'tsCode', width: 115 }, { title: '名称', dataIndex: 'name', width: 115 },
                {
                  title: '行业', key: 'industry', width: 160, render: (_, r) => <SectorLinks stock={r} date={date} />,
                }, {
                  title: '题材', key: 'topics', width: 240, render: (_, r) => <SectorLinks stock={r} type="N" date={date} />,
                },
                {
                  title: '收盘价(元)', dataIndex: 'close', align: 'right', render: (v) => numberText(v),
                }, {
                  title: '涨跌幅(%)', dataIndex: 'pctChg', align: 'right', render: (v) => <span className={changeClass(v)}>{numberText(v, 2, true)}</span>,
                },
                {
                  title: '成交额(亿元)', dataIndex: 'amount', align: 'right', render: (v) => scaledNumber(v, 100000),
                },
                {
                  title: '涨停', dataIndex: 'limitUp', align: 'center', render: (v:boolean, r) => (v && allowedPath(user, '/analysis/limits') ? <Link href={jump('/analysis/limits', detail.code, { keyword: r.tsCode, type: 'U' })}>查看</Link> : '—'),
                },
                ...(allowedPath(user, '/strategy') ? [{
                  title: '策略命中',
                  key: 'signals',
                  width: 220,
                  render: (_: unknown, r: SectorMember) => (!signalsReady ? '待更新' : (
                    <Space wrap>
                      {(stockSignals.get(r.tsCode) || []).map((key) => <Link key={key} href={strategyHref(key, detail.code, r.tsCode)}>{strategyLabels.get(key)}</Link>)}
                      {!stockSignals.get(r.tsCode)?.length && '—'}
                    </Space>
                  )),
                }] : []),
                {
                  title: '龙虎榜',
                  key: 'dragon',
                  align: 'center',
                  render: (_, r) => {
                    if (dragon.error) return '暂不可用';
                    if (dragon.loading) return '查询中';
                    return dragonCodes.has(r.tsCode) && allowedPath(user, '/analysis/dragon') ? <Link href={jump('/analysis/dragon', detail.code, { code: r.tsCode })}>查看</Link> : '—';
                  },
                },
              ]}
            />
          </>
          )}
        </div>
      </DataState>
    </MarketShell>
  );
}
