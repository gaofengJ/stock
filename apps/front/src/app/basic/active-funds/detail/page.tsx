/* eslint-disable no-nested-ternary */

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from '@/components/Interaction';
import {
  DatePicker, Select, Space, Tag,
} from 'antd';
import dayjs from 'dayjs';
import Loading from '@/components/Loading';
import Table from '@/components/DataTable';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { scaledNumber } from '@/utils/format';
import {
  BasicShell, StockLink, SourceState, useWorkbench,
} from '../../components/workbench';

function Seat() {
  const params = useSearchParams(); const org = params.get('org') || ''; const fallback = useDefaultTradeDate();
  const [selected, setSelected] = useState(params.get('date') || ''); const date = selected || (fallback.ready ? fallback.tradeDate : ''); const [days, setDays] = useState('7');
  const state = useWorkbench('seat', { date, org, days }, !!date && !!org);
  return (
    <BasicShell title={org || '营业部档案'} path="/basic/active-funds">
      <Space className="mb-16" wrap>
        <Link href={`/basic/active-funds/?org=${encodeURIComponent(org)}`}>游资名录</Link>
        <DatePicker value={date ? dayjs(date) : null} allowClear={false} onChange={(v) => { if (v) setSelected(v.format('YYYY-MM-DD')); }} />
        <Select value={days} onChange={setDays} options={[{ label: '近7个交易日', value: '7' }, { label: '近30个交易日', value: '30' }]} />
      </Space>
      <SourceState data={state.data} error={state.error} retry={state.retry} />
      <Space wrap className="mb-16">
        <span>关联线索</span>
        {state.data?.funds?.length ? state.data.funds.map((f: any) => <Tag key={f.name}>{f.name}</Tag>) : <span>暂无公开名录关联</span>}
        <span>
          区间最近上榜：
          {state.data?.lastActivity || '尚无已知记录'}
        </span>
        <span>
          已覆盖
          {state.data?.sources?.filter((s: any) => s.state === 'ready').length || 0}
          /
          {state.data?.dates?.length || 0}
          {' '}
          个交易日
        </span>
      </Space>
      <p className="basic-muted">{state.data?.note}</p>
      <Table
        loading={state.loading}
        pagination={false}
        scroll={{ x: 1000 }}
        rowKey={(r: any) => `${r.date}-${r.tsCode}-${r.side}-${r.reason}`}
        dataSource={state.data?.items || []}
        columns={[
          { title: '上榜日期', dataIndex: 'date', width: 120 }, {
            title: '股票', dataIndex: 'tsCode', width: 200, render: (v, r: any) => <StockLink code={v} name={`${r.name || v} ${r.name && r.name !== v ? v : ''}`} date={r.date} />,
          },
          {
            title: '榜单', dataIndex: 'side', width: 90, render: (v) => (String(v) === '0' ? '买入榜' : String(v) === '1' ? '卖出榜' : '—'),
          },
          ...[{ key: 'buy', label: '买入' }, { key: 'sell', label: '卖出' }, { key: 'net_buy', label: '净买入' }].map(({ key, label }) => ({
            title: `${label}（万元）`, dataIndex: key, width: 140, align: 'right' as const, render: (v: unknown) => scaledNumber(v, 10000),
          })),
          { title: '上榜原因', dataIndex: 'reason' }, {
            title: '详情', key: 'link', width: 90, render: (_, r: any) => <Link href={`/analysis/dragon/?date=${r.date}&code=${r.tsCode}`}>龙虎榜</Link>,
          },
        ]}
      />
    </BasicShell>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Seat /></Suspense>; }
