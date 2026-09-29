'use client';

import { useState } from 'react';
import {
  Button, Input, Select, Space, Table, Tabs,
} from 'antd';
import { changeClass, scaledNumber } from '@/utils/format';
import { LimitRow } from '@/api/market';
import LegacyPage from './LegacyPage';
import MarketCompatibility from '../components/MarketCompatibility';
import MarketShell from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import { DataState, numberText, SectionTitle } from '../components/MarketCharts';
import DragonDrawer from '../components/DragonDrawer';
import { useMarket } from '../components/MarketContext';

function LimitsPage() {
  const [type, setType] = useState('U'); const [keyword, setKeyword] = useState('');
  const [height, setHeight] = useState<number | undefined>();
  const [stock, setStock] = useState<LimitRow | null>(null);
  const { date } = useMarket();
  const {
    data, loading, error, retry,
  } = useMarketData<{ ready: boolean; items: LimitRow[] }>('limits', { type, keyword, height });
  const raw = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const amount = (v: string | null) => scaledNumber(v, 100000000);
  return (
    <MarketShell title="涨停复盘" path="/analysis/limits">
      <Tabs activeKey={type} onChange={setType} items={[{ key: 'U', label: '涨停' }, { key: 'Z', label: '炸板' }, { key: 'D', label: '跌停' }]} />
      <Space className="mb-16" wrap>
        <Input.Search allowClear placeholder="股票名称／代码" onSearch={setKeyword} style={{ width: 260 }} />
        <Select allowClear placeholder="连板数" value={height} onChange={setHeight} style={{ width: 140 }} options={[{ value: 1, label: '首板' }, { value: 2, label: '二板' }, { value: 3, label: '三板' }, { value: 4, label: '四板及以上' }]} />
      </Space>
      <SectionTitle title="股票列表" description="非ST样本；涨停与炸板按收盘状态区分。缺失封板信息显示“—”。" />
      <DataState loading={loading} error={error} retry={retry} empty={!data?.ready}>
        <Table<LimitRow>
          key={`${date}-${type}-${height}-${keyword}`}
          locale={{ emptyText: keyword || height ? '没有符合筛选条件的股票' : '该范围当日无此类事件' }}
          rowKey="tsCode"
          dataSource={data?.items}
          size="middle"
          bordered
          scroll={{ x: 1800 }}
          pagination={{ pageSize: 50, showSizeChanger: false }}
          columns={[
            {
              title: '代码', dataIndex: 'tsCode', fixed: 'left', width: 115,
            }, {
              title: '名称', dataIndex: 'name', fixed: 'left', width: 105,
            },
            { title: '行业', dataIndex: 'industry', render: raw }, {
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
              title: '详情', key: 'action', fixed: 'right', width: 90, render: (_, r) => <Button type="link" onClick={() => setStock(r)}>龙虎榜</Button>,
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
