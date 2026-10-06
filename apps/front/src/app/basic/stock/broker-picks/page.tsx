'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Button, DatePicker, Empty, Input, Select,
} from 'antd';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';
import Link from '@/components/Interaction';
import Table from '@/components/DataTable';
import Loading from '@/components/Loading';
import {
  RequestState, SourceBlock, textColumn, useResearch,
} from '@/components/LiveResearch/common';
import type { Row } from '@/components/LiveResearch/data';
import {
  brokerMonth, brokerRows, brokerStockHref, currentBrokerMonth, filterBrokerRows, validStockCode,
} from './display';
import './page.css';

function BrokerPicksPage() {
  const params = useSearchParams();
  const current = currentBrokerMonth();
  const month = brokerMonth(params.get('month'), current);
  const broker = params.get('broker') || '';
  const keyword = params.get('q') || '';
  const state = useResearch('broker-picks', { month });
  const source = state.data?.month === month ? state.data.sources.find((s) => s.source === 'broker_recommend') : undefined;
  const rows = brokerRows(source?.rows || [], month);
  const brokers = Array.from(new Set(rows.map((r) => r.broker).filter(Boolean)));
  const stocks = new Set(rows.filter((r) => validStockCode(r.ts_code)).map((r) => r.ts_code));
  const filtered = filterBrokerRows(rows, broker, keyword);
  const change = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    next.set('month', month);
    Object.entries(updates).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    window.history.replaceState(null, '', `/basic/stock/broker-picks/?${next}`);
  };
  const stockLink = (value: string, row: Row) => (validStockCode(row.ts_code)
    ? <Link href={brokerStockHref(row.ts_code, month)}>{value || row.ts_code}</Link> : value || '—');
  return (
    <Layout asideMenuItems={basicSiderMenuItems} headerMenuActive={EHeaderMenuKey.basic} asideMenuActive={EBasicAsideMenuKey.basicBrokerPicks}>
      <div className="broker-picks p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">券商月度金股</h1>
        <p className="live-research-note">按月份查看券商推荐名单，股票名称可跳转个股档案。</p>
        <div className="broker-picks-filters">
          <div className="broker-picks-month">
            <span>金股月份</span>
            <DatePicker id="broker-picks-month" aria-label="金股月份" picker="month" allowClear={false} value={dayjs(`${month}-01`)} disabledDate={(date) => date.format('YYYY-MM') > current} onChange={(date) => { if (date) change({ month: date.format('YYYY-MM'), broker: '' }); }} />
          </div>
          <Select className="broker-picks-broker" aria-label="推荐券商" showSearch allowClear optionFilterProp="label" placeholder="全部券商" value={broker || undefined} onChange={(value) => change({ broker: value || '' })} options={[...brokers, ...(broker && !brokers.includes(broker) ? [broker] : [])].map((value) => ({ label: value, value }))} />
          <Input.Search className="broker-picks-search" aria-label="搜索金股名称或代码" allowClear placeholder="股票名称／代码" value={keyword} onChange={(event) => change({ q: event.target.value })} />
          <Button onClick={state.retry} loading={state.loading}>刷新资料</Button>
          {(broker || keyword) && <Button onClick={() => change({ broker: '', q: '' })}>重置筛选</Button>}
        </div>
        <RequestState state={state}>
          <SourceBlock source={source} title={`${month} 推荐名单`} retry={state.retry} empty={!rows.length} note="名单按所选月份实时获取；同一股票可由多家券商推荐。接口未提供推荐发布时间，月内名单不能还原历史当日已知信息。">
            <div className="broker-picks-summary">
              <span>{`${brokers.length} 家券商 · ${stocks.size} 只股票 · ${rows.length} 条推荐`}</span>
              <span>{`筛选结果 ${filtered.length} 条`}</span>
            </div>
            <Table<Row>
              key={`${month}-${broker}-${keyword}`}
              rowKey="key"
              dataSource={filtered}
              columns={[textColumn('broker', '推荐券商', 240), { ...textColumn('name', '股票名称', 180), render: stockLink }, textColumn('ts_code', '股票代码', 150), textColumn('month', '推荐月份', 130)]}
              scroll={{ x: 700 }}
              pagination={{
                defaultPageSize: 20, pageSizeOptions: [20, 50, 100], showSizeChanger: true, hideOnSinglePage: false, showTotal: (total) => `共 ${total} 条`,
              }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合筛选条件的推荐记录" /> }}
            />
          </SourceBlock>
          {!rows.length && source?.state === 'ready' && <p className="live-research-note">{`${month} 暂无推荐记录，可选择其他月份查看。`}</p>}
        </RequestState>
      </div>
    </Layout>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading height="100dvh" />}><BrokerPicksPage /></Suspense>;
}
