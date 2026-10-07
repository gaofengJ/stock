'use client';

import { InteractionButton } from '@/components/Interaction';
import { StockLink } from '@/components/StockActions';
import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert, Button, Input, Select, Segmented, Space, Tag, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Table from '@/components/DataTable';
import { DragonBoard, DragonListing } from '@/api/market';
import { beijingTime, changeClass, numberText } from '@/utils/format';
import SectorFilter, { useSectorSelection } from '@/components/SectorFilter';
import SectorLinks from '@/components/SectorLinks';
import HelpTooltip from '@/components/HelpTooltip';
import MarketShell from '../components/MarketShell';
import { useMarket } from '../components/MarketContext';
import useMarketData from '../components/useMarketData';
import { DataState, SectionTitle } from '../components/MarketCharts';
import { DragonDetails } from '../components/DragonDrawer';
import { marketHref } from '../components/market-navigation';
import {
  dragonRowKey, filterDragonRows, flowValue, fundingPeriod, periodLabels, periodValue,
} from './dragon-display';
import './dragon-board.sass';

const money = (v: number | null, signed = false) => numberText(v == null ? null : v / 10000, 2, signed);
const extraFields = {
  close: '收盘价', turnoverRate: '换手率', industry: '所属行业', topics: '所属概念',
};

export default function Page() {
  const { sector, setSector } = useSectorSelection();
  const { date, scope } = useMarket();
  const params = useSearchParams();
  const router = useRouter();
  const code = /^\d{6}\.(SH|SZ|BJ)$/.test(params.get('code') || '') ? params.get('code') || '' : '';
  const linkedReason = params.get('reason') || undefined;
  const linkedKeyword = params.get('keyword') || '';
  const [keyword, setKeyword] = useState(linkedKeyword);
  const flow = flowValue(params.get('flow'));
  const period = periodValue(params.get('period'));
  const [extras, setExtras] = useState<string[]>([]);
  const detail = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const scrollPending = useRef(!!code);
  const {
    data, loading, error, retry,
  } = useMarketData<DragonBoard>('dragon-board', { days: 20, sector });
  const snapshot = useRef({ data, date });
  if (data !== snapshot.current.data) snapshot.current = { data, date };
  const resultDate = snapshot.current.date;
  const rows = useMemo(() => filterDragonRows(data?.items || [], keyword, flow, period), [data, keyword, flow, period]);
  const selected = rows.find((r) => r.tsCode === code && (!linkedReason || r.reason === linkedReason));
  const selectedKey = selected ? dragonRowKey(selected) : '';
  const filterParams = useMemo(() => ({
    ...(sector ? { sector } : {}),
    ...(keyword ? { keyword } : {}),
    ...(flow !== 'all' ? { flow } : {}),
    ...(period !== 'all' ? { period } : {}),
  }), [sector, keyword, flow, period]);
  const changeFilters = useCallback((change: Record<string, string>) => {
    scrollPending.current = false;
    // A new filter starts a new list selection; no hidden stock detail survives it.
    router.replace(marketHref('/analysis/dragon', { date, scope }, { ...filterParams, ...change }), { scroll: false });
  }, [date, scope, filterParams, router]);
  useEffect(() => setKeyword(linkedKeyword), [linkedKeyword]);
  useEffect(() => {
    if (keyword === linkedKeyword) return undefined;
    const timer = setTimeout(() => changeFilters({ keyword }), 250);
    return () => clearTimeout(timer);
  }, [keyword, linkedKeyword, changeFilters]);
  const open = (r: DragonListing) => {
    scrollPending.current = true;
    router.push(marketHref('/analysis/dragon', { date, scope }, { ...filterParams, code: r.tsCode, reason: r.reason }), { scroll: false });
    if (selectedKey === dragonRowKey(r)) {
      detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrollPending.current = false;
    }
  };
  const clear = (returnToList = false) => {
    scrollPending.current = false;
    router.replace(marketHref('/analysis/dragon', { date, scope }, filterParams), { scroll: false });
    if (returnToList) list.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (!loading && !error && selectedKey && scrollPending.current) {
      detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrollPending.current = false;
    }
  }, [selectedKey, loading, error]);
  const columns: ColumnsType<DragonListing> = [
    {
      title: '股票',
      key: 'stock',
      fixed: 'left',
      width: 160,
      render: (_, r) => (
        <div>
          <StockLink code={r.tsCode} name={r.name} date={date} />
          <div className="market-note">{r.tsCode}</div>
        </div>
      ),
    },
    {
      title: '净买入(万元)', dataIndex: 'netAmount', width: 140, align: 'right', defaultSortOrder: 'descend', sorter: (a, b) => (a.netAmount ?? -Infinity) - (b.netAmount ?? -Infinity), render: (v) => <strong className={changeClass(v)}>{money(v, true)}</strong>,
    },
    {
      title: '涨跌幅(%)', dataIndex: 'pctChange', width: 120, align: 'right', sorter: (a, b) => (a.pctChange ?? -Infinity) - (b.pctChange ?? -Infinity), render: (v) => <span className={changeClass(v)}>{numberText(v, 2, true)}</span>,
    },
    {
      title: (
        <span>
          资金期间
          <HelpTooltip label="资金期间" title="按上榜原因区分当日与跨日累计金额。未明确期间的记录单独标示；不同期间不合并统计。" />
        </span>
      ),
      key: 'period',
      width: 135,
      render: (_, r) => <Tag className="dragon-period">{periodLabels[fundingPeriod(r.reason)]}</Tag>,
    },
    {
      title: '上榜原因', dataIndex: 'reason', ellipsis: { showTitle: false }, render: (v) => <Tooltip title={v}>{v || '—'}</Tooltip>,
    },
    {
      title: '买入(万元)', dataIndex: 'lBuy', width: 125, align: 'right', render: (v) => <span className={v == null ? 'quote-flat' : 'quote-up'}>{money(v)}</span>,
    },
    {
      title: '卖出(万元)', dataIndex: 'lSell', width: 125, align: 'right', render: (v) => <span className={v == null ? 'quote-flat' : 'quote-down'}>{money(v)}</span>,
    },
    ...([
      {
        title: '收盘价(元)', dataIndex: 'close', key: 'close', width: 105, align: 'right', render: (v: number | null) => numberText(v),
      },
      {
        title: '换手率(%)', dataIndex: 'turnoverRate', key: 'turnoverRate', width: 110, align: 'right', render: (v: number | null) => numberText(v),
      },
      {
        title: '所属行业', key: 'industry', width: 160, render: (_: unknown, r: DragonListing) => <SectorLinks stock={r} date={date} />,
      },
      {
        title: '所属概念', key: 'topics', width: 220, render: (_: unknown, r: DragonListing) => <SectorLinks stock={r} type="N" date={date} />,
      },
    ] as ColumnsType<DragonListing>).filter((c) => extras.includes(String(c.key))),
    {
      title: '席位明细', key: 'details', width: 100, fixed: 'right', align: 'center', render: (_, r) => <InteractionButton intent="select" selected={selectedKey === dragonRowKey(r)} aria-controls="dragon-detail" onClick={() => open(r)} aria-label={`查看${r.name}席位`}>查看</InteractionButton>,
    },
  ];
  return (
    <MarketShell title="龙虎榜" path="/analysis/dragon">
      <div className="dragon-board">
        <div className="dragon-board-toolbar">
          <SectorFilter value={sector} onChange={(value) => { setSector(value); changeFilters({ sector: value || '' }); }} />
          <Input.Search allowClear aria-label="搜索龙虎榜股票" placeholder="股票名称／代码" value={keyword} onChange={(e) => { scrollPending.current = false; setKeyword(e.target.value); }} onSearch={(value) => changeFilters({ keyword: value })} style={{ width: 230 }} />
          <Segmented aria-label="龙虎榜资金方向" options={[{ label: '全部方向', value: 'all' }, { label: '净买入', value: 'buy' }, { label: '净卖出', value: 'sell' }]} value={flow} onChange={(v) => changeFilters({ flow: String(v) })} />
          <Select aria-label="资金统计期间" value={period} onChange={(value) => changeFilters({ period: value })} style={{ width: 140 }} options={Object.entries(periodLabels).map(([value, label]) => ({ value, label }))} />
          {(keyword || sector || flow !== 'all' || period !== 'all') && (
          <Button
            size="small"
            onClick={() => {
              setSector(undefined); setKeyword(''); changeFilters({
                sector: '', keyword: '', flow: 'all', period: 'all',
              });
            }}
          >
            重置筛选
          </Button>
          )}
        </div>
        <div className="dragon-board-list-title" ref={list}>
          <SectionTitle title="上榜股票" description="每条记录对应一个上榜原因。资金按上榜期间分别展示，不合并重复股票或不同原因的金额。" />
          <Space wrap>
            <span className="dragon-board-count">{loading ? '更新中…' : `${new Set(rows.map((r) => r.tsCode)).size}只股票／${rows.length}条记录`}</span>
            <Select mode="multiple" aria-label="龙虎榜补充列" placeholder="补充列" maxTagCount={0} maxTagPlaceholder={() => `补充列 ${extras.length}`} value={extras} onChange={setExtras} style={{ width: 150 }} options={Object.entries(extraFields).map(([value, label]) => ({ value, label }))} />
          </Space>
        </div>
        <p className="interaction-hint">选择股票查看席位；当日与跨日累计资金按各自期间比较。</p>
        <DataState loading={loading} error={error} retry={retry} empty={!data}>
          <Table<DragonListing> size="small" bordered pagination={false} rowKey={dragonRowKey} dataSource={rows} tableLayout="fixed" scroll={{ x: columns.reduce((sum, c) => sum + Number(c.width || 280), 0) }} maxBodyHeight={480} minBodyHeight={240} rowClassName={(r) => (selectedKey === dragonRowKey(r) ? 'interaction-selected-row' : '')} locale={{ emptyText: keyword || sector || flow !== 'all' || period !== 'all' ? '没有符合筛选条件的上榜记录' : '当日暂无龙虎榜记录' }} columns={columns} />
          {data?.queriedAt && (
          <p className="dragon-board-updated">
            龙虎榜查询于北京时间
            {beijingTime(data.queriedAt)}
          </p>
          )}
        </DataState>
        <div id="dragon-detail" ref={detail} className={selected ? 'dragon-board-detail' : 'dragon-board-detail-hint'}>
          {selected && (
            <DataState loading={loading} error={error} retry={retry} empty={false}>
              <div className="dragon-board-stock-heading">
                <div>
                  <StockLink code={selected.tsCode} name={selected.name} date={date} />
                  <span className="dragon-stock-code">
                    {selected.tsCode}
                    {' '}
                    ·
                    {' '}
                    {resultDate}
                  </span>
                </div>
                <InteractionButton intent="expand" expanded onClick={() => clear(true)} aria-controls="dragon-detail">收起明细</InteractionButton>
              </div>
              <DragonDetails stock={selected} date={resultDate} reason={selected.reason} active={!loading && !error} availableReasons={rows.filter((r) => r.tsCode === selected.tsCode).map((r) => r.reason)} onReasonChange={(reason) => router.replace(marketHref('/analysis/dragon', { date, scope }, { ...filterParams, code: selected.tsCode, reason }), { scroll: false })} />
            </DataState>
          )}
          {!selected && code && !loading && !error && <Alert type="info" showIcon message="所选上榜记录不在当前日期、范围或筛选结果中" action={<Button size="small" onClick={() => clear()}>清除定位</Button>} />}
          {!selected && !code && !loading && !!rows.length && <span>选择上榜股票，查看买卖席位。</span>}
        </div>
      </div>
    </MarketShell>
  );
}
