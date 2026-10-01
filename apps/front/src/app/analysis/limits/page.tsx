'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import {
  Button, Input, Select, Space, Tabs, Tooltip,
} from 'antd';
import Table from '@/components/DataTable';
import { changeClass, scaledNumber } from '@/utils/format';
import { DragonList, LimitRow } from '@/api/market';
import SectorFilter, { useSectorSelection } from '@/components/SectorFilter';
import SectorLinks from '@/components/SectorLinks';
import LegacyPage from './LegacyPage';
import MarketCompatibility from '../components/MarketCompatibility';
import MarketShell from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import { DataState, numberText, SectionTitle } from '../components/MarketCharts';
import DragonDrawer from '../components/DragonDrawer';
import { useMarket } from '../components/MarketContext';
import { linkedLimitType, marketHref } from '../components/market-navigation';

function LimitsPage() {
  const { sector, setSector } = useSectorSelection();
  const params = useSearchParams();
  const linkedKeyword = params.get('keyword') || '';
  const linkedType = linkedLimitType(params.get('type'));
  const [type, setType] = useState(linkedType); const [keyword, setKeyword] = useState(linkedKeyword);
  const [search, setSearch] = useState(linkedKeyword);
  const [height, setHeight] = useState<number | undefined>();
  const [stock, setStock] = useState<LimitRow | null>(null);
  const { date, scope } = useMarket();
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
    type, keyword, height, sector,
  });
  const raw = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const amount = (v: string | null) => scaledNumber(v, 100000000);
  return (
    <MarketShell title="涨停复盘" path="/analysis/limits">
      <Tabs activeKey={type} onChange={setType} items={[{ key: 'U', label: '涨停' }, { key: 'Z', label: '炸板' }, { key: 'D', label: '跌停' }]} />
      <Space className="mb-16" wrap>
        <SectorFilter value={sector} onChange={setSector} />
        <Input.Search allowClear placeholder="股票名称／代码" value={search} onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setKeyword(''); }} onSearch={setKeyword} style={{ width: 260 }} />
        <Select allowClear placeholder="连板数" value={height} onChange={setHeight} style={{ width: 140 }} options={[{ value: 1, label: '首板' }, { value: 2, label: '二板' }, { value: 3, label: '三板' }, { value: 4, label: '四板及以上' }]} />
      </Space>
      <SectionTitle title="股票列表" description="非ST样本；涨停与炸板按收盘状态区分。缺失封板信息显示“—”。" />
      <DataState loading={loading} error={error} retry={retry} empty={!data?.ready}>
        <Table<LimitRow>
          key={`${date}-${type}-${height}-${keyword}-${sector}`}
          locale={{ emptyText: keyword || height ? '没有符合筛选条件的股票' : '该范围当日无此类事件' }}
          rowKey="tsCode"
          dataSource={data?.items}
          size="middle"
          bordered
          scroll={{ x: 1800 }}
          pagination={false}
          maxBodyHeight={Number.POSITIVE_INFINITY}
          bottomSpacing={16}
          columns={[
            {
              title: '代码', dataIndex: 'tsCode', fixed: 'left', width: 115,
            }, {
              title: '名称', dataIndex: 'name', fixed: 'left', width: 105,
            },
            {
              title: '行业', key: 'industry', width: 150, render: (_, r) => <SectorLinks stock={r} date={date} />,
            },
            {
              title: '题材', key: 'topics', width: 220, render: (_, r) => <SectorLinks stock={r} type="N" date={date} />,
            }, {
              title: '涨跌幅(%)', dataIndex: 'pctChg', align: 'right', render: (v) => <span className={changeClass(v)}>{numberText(v, 2, true)}</span>, sorter: (a, b) => Number(a.pctChg) - Number(b.pctChg),
            },
            {
              title: '收盘价(元)', dataIndex: 'close', align: 'right', render: (v) => numberText(v),
            },
            {
              title: '连板数', dataIndex: 'limitTimes', align: 'right', render: raw, sorter: (a, b) => a.limitTimes - b.limitTimes,
            },
            { title: '近N日涨停情况', dataIndex: 'upStat', render: (v: string | null) => (v?.includes('/') ? `${v.split('/')[1]}天${v.split('/')[0]}板` : raw(v)) },
            { title: '首次封板', dataIndex: 'firstTime', render: raw }, { title: '最后封板', dataIndex: 'lastTime', render: raw },
            {
              title: '开板次数', dataIndex: 'openTimes', align: 'right', render: raw,
            }, {
              title: '换手率(%)', dataIndex: 'turnoverRatio', align: 'right', render: (v) => numberText(v),
            },
            {
              title: '成交额(亿元)', dataIndex: 'amount', align: 'right', render: amount, sorter: (a, b) => Number(a.amount) - Number(b.amount),
            },
            {
              title: '封单额(亿元)', dataIndex: 'fdAmount', align: 'right', render: amount,
            }, {
              title: '流通市值(亿元)', dataIndex: 'floatMv', align: 'right', render: amount,
            },
            {
              title: canReadDragon ? <Link href={dragonHref()}>龙虎榜</Link> : '龙虎榜',
              key: 'action',
              fixed: 'right',
              align: 'center',
              width: 90,
              render: (_, r) => {
                if (dragon.loading) return <span className="quote-flat">核对中</span>;
                if (dragon.error) return <Tooltip title="榜单查询失败"><Button type="link" size="small" onClick={dragon.retry}>重试</Button></Tooltip>;
                if (!dragonCodes.has(r.tsCode)) return <Tooltip title="当日未上榜"><span className="quote-flat">—</span></Tooltip>;
                return canReadDragon ? <Link href={dragonHref(r.tsCode)} aria-label={`查看${r.name}龙虎榜`}>查看</Link> : <Button type="link" onClick={() => setStock(r)}>查看</Button>;
              },
            },
          ]}
        />
      </DataState>
      <DragonDrawer stock={stock} date={date} close={() => setStock(null)} />
    </MarketShell>
  );
}

export default function Page() {
  return <MarketCompatibility legacy={<LegacyPage />}><LimitsPage /></MarketCompatibility>;
}
