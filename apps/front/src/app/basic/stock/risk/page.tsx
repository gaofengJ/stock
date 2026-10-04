'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DatePicker, Input, Select, Space,
} from 'antd';
import dayjs from 'dayjs';
import Loading from '@/components/Loading';
import Table from '@/components/DataTable';
import SectorFilter from '@/components/SectorFilter';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import RiskInspect from '../../components/RiskInspect';
import {
  BasicShell, StockLink, SourceState, useWorkbench,
} from '../../components/workbench';

function Risk() {
  const params = useSearchParams(); const fallback = useDefaultTradeDate();
  const [selected, setSelected] = useState(params.get('date') || ''); const date = selected || (fallback.ready ? fallback.tradeDate : '');
  const [keyword, setKeyword] = useState(params.get('code') || ''); const [sector, setSector] = useState<string>(); const [type, setType] = useState<string>();
  const state = useWorkbench('risk', { date, keyword, sector }, !!date);
  return (
    <BasicShell title="风险与交易状态" path="/basic/stock/risk">
      <Space className="mb-16" wrap>
        <DatePicker aria-label="交易日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(v) => { if (v) setSelected(v.format('YYYY-MM-DD')); }} />
        <Input.Search placeholder="股票代码／名称" defaultValue={keyword} allowClear onSearch={setKeyword} />
        <SectorFilter value={sector} onChange={setSector} />
        <Select allowClear placeholder="风险类型" value={type} onChange={setType} style={{ width: 150 }} options={['ST', '减持', '停牌', '复牌', '异常波动', '严重异常波动', '交易所提示'].map((v) => ({ label: v, value: v }))} />
      </Space>
      <SourceState data={state.data} error={state.error} retry={state.retry} />
      {/^[0-9]{6}\.(SH|SZ|BJ)$/.test(keyword) && <RiskInspect code={keyword} date={date} />}
      <p className="basic-muted">{state.data?.note || '按所选日期查询；无记录不代表无风险。'}</p>
      <Table
        loading={state.loading}
        rowKey={(r: any) => `${r.tsCode}-${r.type}-${r.eventDate}-${r.detail}`}
        dataSource={(state.data?.items || []).filter((r: any) => !type || r.type === type)}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1000 }}
        columns={[
          {
            title: '股票', key: 'stock', width: 180, render: (_, r: any) => <StockLink code={r.tsCode} name={`${r.name || ''} ${r.tsCode}`} date={date} />,
          },
          {
            title: '核验', key: 'check', width: 100, render: (_, r: any) => <RiskInspect code={r.tsCode} date={date} />,
          },
          { title: '类型', dataIndex: 'type', width: 130 }, { title: '公告／发生日期', dataIndex: 'eventDate', width: 140 }, {
            title: '参考截止日期', dataIndex: 'endDate', width: 140, render: (v) => v || '—',
          }, { title: '说明', dataIndex: 'detail', ellipsis: true },
        ]}
      />
    </BasicShell>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Risk /></Suspense>; }
