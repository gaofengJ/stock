'use client';

import Link, { InteractionButton } from '@/components/Interaction';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import {
  Button, Input, Select, Space, Tabs, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import HelpTooltip from '@/components/HelpTooltip';
import Table from '@/components/DataTable';
import { changeClass, scaledNumber } from '@/utils/format';
import { DragonList, LimitRow } from '@/api/market';
import SectorFilter, { useSectorSelection } from '@/components/SectorFilter';
import SectorLinks from '@/components/SectorLinks';
import RiskStatus from './RiskStatus';
import './limits.sass';
import { RiskTags, StockLink, useWorkbench } from '../../basic/components/workbench';
import LegacyPage from './LegacyPage';
import MarketCompatibility from '../components/MarketCompatibility';
import MarketShell from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import { DataState, numberText, SectionTitle } from '../components/MarketCharts';
import DragonDrawer from '../components/DragonDrawer';
import { useMarket } from '../components/MarketContext';
import { linkedLimitType, marketHref } from '../components/market-navigation';

const defaultColumns = ['pctChg', 'limitTimes', 'topics', 'firstTime', 'lastTime', 'openTimes', 'amount'];
const fieldNames: Record<string, string> = {
  pctChg: '涨跌幅', limitTimes: '连板数', topics: '所属概念', industry: '所属行业', close: '收盘价', upStat: '近期涨停记录', firstTime: '首次封板', lastTime: '最后封板', openTimes: '开板次数', turnoverRatio: '换手率', amount: '成交额', fdAmount: '封单额', floatMv: '流通市值',
};
// Minimum widths keep compact values readable; text columns get more of the spare space.
const columnSizing: Record<string, { width: number; grow: number }> = {
  stock: { width: 160, grow: 0 },
  topics: { width: 260, grow: 3 },
  industry: { width: 130, grow: 1.2 },
  pctChg: { width: 96, grow: 0.4 },
  limitTimes: { width: 80, grow: 0.2 },
  close: { width: 96, grow: 0.4 },
  upStat: { width: 116, grow: 0.5 },
  firstTime: { width: 96, grow: 0.4 },
  lastTime: { width: 96, grow: 0.4 },
  openTimes: { width: 80, grow: 0.2 },
  turnoverRatio: { width: 96, grow: 0.4 },
  amount: { width: 112, grow: 0.4 },
  fdAmount: { width: 104, grow: 0.4 },
  floatMv: { width: 120, grow: 0.4 },
  action: { width: 72, grow: 0.2 },
};

function LimitsPage() {
  const { sector, setSector } = useSectorSelection();
  const params = useSearchParams();
  const linkedKeyword = params.get('keyword') || '';
  const linkedType = linkedLimitType(params.get('type'));
  const [type, setType] = useState(linkedType); const [keyword, setKeyword] = useState(linkedKeyword);
  const [search, setSearch] = useState(linkedKeyword);
  const [height, setHeight] = useState<number | undefined>();
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const { date, scope } = useMarket();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  useEffect(() => {
    const element = resultsRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setTableWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [date]);
  const [stock, setStock] = useState<LimitRow | null>(null);
  const risks = useWorkbench('risk', { date }, !!date);
  const { user } = useAccount();
  const canReadDragon = allowedPath(user, '/analysis/dragon');
  const dragonHref = (code?: string) => marketHref('/analysis/dragon', { date, scope }, { ...(sector ? { sector } : {}), ...(code ? { code } : {}) });
  const dragon = useMarketData<DragonList>('dragon-list', { days: 20 });
  const dragonCodes = new Set(dragon.data?.codes || []);
  useEffect(() => {
    setKeyword(linkedKeyword); setSearch(linkedKeyword); setType(linkedType); setHeight(undefined);
  }, [linkedKeyword, linkedType]);
  const {
    data, loading, error, retry,
  } = useMarketData<{ ready: boolean; items: LimitRow[] }>('limits', {
    type, keyword, height: type === 'U' ? height : undefined, sector,
  });
  const raw = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const amount = (v: string | null) => scaledNumber(v, 100000000);
  const riskData = risks.data?.date === date ? risks.data : null;
  const optionalFields = Object.entries(fieldNames).filter(([key]) => type === 'U' || !['limitTimes', 'upStat'].includes(key));
  const allColumns: ColumnsType<LimitRow> = [
    {
      title: '股票',
      key: 'stock',
      fixed: 'left',
      render: (_, r) => (
        <div className="limits-stock-cell">
          <StockLink code={r.tsCode} name={r.name} date={date} />
          <span className="limits-stock-code">{r.tsCode}</span>
          <RiskTags data={riskData} code={r.tsCode} date={date} showSourceState={false} />
        </div>
      ),
    },
    {
      title: '所属行业', key: 'industry', render: (_, r) => <SectorLinks stock={r} date={date} />,
    },
    {
      title: (
        <span>
          所属概念
          <HelpTooltip label="所属概念" title="展示同花顺概念分类；当日涨停原因需结合相关公告与市场信息核实。" />
        </span>
      ),
      key: 'topics',
      render: (_, r) => <SectorLinks stock={r} type="N" date={date} />,
    }, {
      title: '涨跌幅',
      dataIndex: 'pctChg',
      align: 'right',
      render: (v) => (
        <span className={changeClass(v)}>
          {numberText(v, 2, true)}
          {v == null ? '' : '%'}
        </span>
      ),
      sorter: (a, b) => Number(a.pctChg) - Number(b.pctChg),
    },
    {
      title: '收盘价(元)', dataIndex: 'close', align: 'right', render: (v) => numberText(v),
    },
    {
      title: '连板数', dataIndex: 'limitTimes', align: 'center', render: (v) => <strong>{raw(v)}</strong>, sorter: (a, b) => a.limitTimes - b.limitTimes,
    },
    {
      title: '近期涨停记录', dataIndex: 'upStat', align: 'center', render: (v: string | null) => (v?.includes('/') ? `${v.split('/')[1]}天${v.split('/')[0]}板` : raw(v)),
    },
    {
      title: '首次封板', dataIndex: 'firstTime', align: 'center', render: raw,
    }, {
      title: '最后封板', dataIndex: 'lastTime', align: 'center', render: raw,
    },
    {
      title: '开板次数', dataIndex: 'openTimes', align: 'center', render: raw,
    }, {
      title: '换手率(%)', dataIndex: 'turnoverRatio', align: 'right', render: (v) => numberText(v),
    },
    {
      title: '成交额(亿)', dataIndex: 'amount', align: 'right', render: amount, sorter: (a, b) => Number(a.amount) - Number(b.amount),
    },
    {
      title: '封单额(亿)', dataIndex: 'fdAmount', align: 'right', render: amount,
    }, {
      title: '流通市值(亿)', dataIndex: 'floatMv', align: 'right', render: amount,
    },
    {
      title: canReadDragon ? <Link href={dragonHref()}>龙虎榜</Link> : '龙虎榜',
      key: 'action',
      fixed: 'right',
      align: 'center',
      render: (_, r) => {
        if (dragon.loading) return <span className="quote-flat">核对中</span>;
        if (dragon.error) return <Tooltip title="榜单查询失败"><Button type="default" size="small" onClick={dragon.retry}>重试</Button></Tooltip>;
        if (!dragonCodes.has(r.tsCode)) return <Tooltip title="当日未上榜"><span className="quote-flat">—</span></Tooltip>;
        return canReadDragon ? <Link href={dragonHref(r.tsCode)} aria-label={`查看${r.name}龙虎榜`}>查看</Link> : <InteractionButton intent="preview" onClick={() => setStock(r)}>查看</InteractionButton>;
      },
    },
  ];
  const order = ['stock', 'pctChg', 'limitTimes', 'topics', 'industry', 'close', 'upStat', 'firstTime', 'lastTime', 'openTimes', 'turnoverRatio', 'amount', 'fdAmount', 'floatMv', 'action'];
  const selectedColumns = allColumns.map((column) => ({ ...column, key: String(column.key || ('dataIndex' in column ? column.dataIndex : '')) }))
    .filter((column) => column.key === 'stock' || column.key === 'action' || (visibleColumns.includes(column.key) && optionalFields.some(([key]) => key === column.key)))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const minimumWidth = selectedColumns.reduce((sum, column) => sum + columnSizing[column.key].width, 0);
  const totalGrow = selectedColumns.reduce((sum, column) => sum + columnSizing[column.key].grow, 0);
  const spareWidth = Math.max(0, tableWidth - 16 - minimumWidth);
  const columns = selectedColumns.map((column) => ({
    ...column,
    width: columnSizing[column.key].width + Math.floor((spareWidth * columnSizing[column.key].grow) / totalGrow),
    className: ['stock', 'topics', 'industry'].includes(column.key) ? undefined : 'limits-value-cell',
  }));
  return (
    <MarketShell title="涨停复盘" path="/analysis/limits">
      <Tabs activeKey={type} onChange={(value) => { setType(value); setHeight(undefined); }} items={[{ key: 'U', label: '涨停' }, { key: 'Z', label: '炸板' }, { key: 'D', label: '跌停' }]} />
      <Space className="mb-16" wrap>
        <SectorFilter value={sector} onChange={setSector} />
        <Input.Search allowClear placeholder="股票名称／代码" value={search} onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setKeyword(''); }} onSearch={setKeyword} style={{ width: 260 }} />
        {type === 'U' && <Select aria-label="连板数筛选" allowClear placeholder="连板数" value={height} onChange={setHeight} style={{ width: 140 }} options={[{ value: 1, label: '首板' }, { value: 2, label: '二板' }, { value: 3, label: '三板' }, { value: 4, label: '四板及以上' }]} />}
      </Space>
      <RiskStatus data={riskData} loading={risks.loading} error={risks.error} retry={risks.retry} />
      <div className="limits-table-toolbar">
        <SectionTitle title="股票列表" description="非ST样本；涨停与炸板按收盘状态区分。缺失封板信息显示“—”；可通过展示列查看其他指标。" />
        <Space wrap>
          <Select aria-label="展示列" mode="multiple" maxTagCount={0} maxTagPlaceholder={() => '展示列'} style={{ width: 150 }} value={visibleColumns.filter((key) => optionalFields.some(([field]) => field === key))} onChange={(keys) => setVisibleColumns([...keys, ...visibleColumns.filter((key) => !optionalFields.some(([field]) => field === key))])} options={optionalFields.map(([value, label]) => ({ value, label }))} />
          <Button size="small" onClick={() => setVisibleColumns(defaultColumns)}>恢复默认列</Button>
        </Space>
      </div>
      <div className="limits-results" ref={resultsRef}>
        <DataState loading={loading} error={error} retry={retry} empty={!data?.ready}>
          <Table<LimitRow>
            key={`${date}-${type}-${height}-${keyword}-${sector}`}
            locale={{ emptyText: keyword || height || sector ? '没有符合筛选条件的股票' : '该范围当日无此类事件' }}
            rowKey="tsCode"
            dataSource={data?.items}
            size="small"
            tableLayout="fixed"
            bordered
            scroll={{ x: columns.reduce((sum, column) => sum + Number(column.width), 0) }}
            pagination={false}
            columns={columns}
          />
        </DataState>
      </div>
      <DragonDrawer stock={stock} date={date} close={() => setStock(null)} />
    </MarketShell>
  );
}

export default function Page() {
  return <MarketCompatibility legacy={<LegacyPage />}><LimitsPage /></MarketCompatibility>;
}
