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
import {
  currentReduction, riskDate, riskRowKey, riskTypeLabel,
} from '../../components/risk-display';

function Risk() {
  const params = useSearchParams();
  const fallback = useDefaultTradeDate();
  const [selected, setSelected] = useState(params.get('date') || '');
  const date = selected || (fallback.ready ? fallback.tradeDate : '');
  const [keyword, setKeyword] = useState(params.get('code') || '');
  const [sector, setSector] = useState<string>();
  const [type, setType] = useState<string>();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const state = useWorkbench('risk', { date, keyword, sector }, !!date);
  return (
    <BasicShell title="风险与交易状态" path="/basic/stock/risk">
      <Space className="mb-16" wrap>
        <DatePicker aria-label="交易日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(value) => { if (value) { setSelected(value.format('YYYY-MM-DD')); setPage(1); } }} />
        <Input.Search placeholder="股票代码／名称" defaultValue={keyword} allowClear onSearch={(value) => { setKeyword(value); setPage(1); }} />
        <SectorFilter value={sector} onChange={(value) => { setSector(value); setPage(1); }} />
        <Select allowClear placeholder="风险类型" value={type} onChange={(value) => { setType(value); setPage(1); }} style={{ width: 150 }} options={['ST', '减持', '停牌', '复牌', '异常波动', '严重异常波动', '交易所提示'].map((value) => ({ label: riskTypeLabel(value), value }))} />
      </Space>
      <div className="risk-list-context">
        <SourceState data={state.data} error={state.error} retry={state.retry} pollingStopped={state.pollingStopped} />
        <p className="basic-muted">{state.data?.note || 'ST及停复牌按所选日期展示；当前减持计划按今天核验，计划起止日期与实际交易发生区间分别核实。'}</p>
        {!!state.data?.reductionCoverage?.unknown && <p className="basic-muted">部分计划的期间或后续状态尚待核实，未计入进行中列表。</p>}
      </div>
      {/^[0-9]{6}\.(SH|SZ|BJ)$/.test(keyword) && <RiskInspect code={keyword} date={date} />}
      <Table
        loading={state.loading}
        rowKey={riskRowKey}
        dataSource={(state.data?.items || []).filter((record: any) => (!type || record.type === type) && (record.type !== '减持' || currentReduction(record, date)))}
        pagination={{
          current: page, pageSize: size, showSizeChanger: true, pageSizeOptions: [20, 50, 100], onChange: (next, pageSize) => { setPage(pageSize !== size ? 1 : next); setSize(pageSize); }, showTotal: (total) => `共 ${total} 条记录`,
        }}
        scroll={{ x: 1250 }}
        columns={[
          {
            title: '股票',
            key: 'stock',
            width: 180,
            render: (_, record: any) => (
              <div>
                <StockLink code={record.tsCode} name={record.name || record.tsCode} date={date} />
                <div className="basic-muted">{record.tsCode}</div>
              </div>
            ),
          },
          {
            title: '类型', dataIndex: 'type', width: 140, render: riskTypeLabel,
          },
          {
            title: '公告日', dataIndex: 'announcementDate', width: 115, render: riskDate, sorter: (a: any, b: any) => String(a.announcementDate || '').localeCompare(String(b.announcementDate || '')),
          },
          {
            title: type === '减持' ? '计划开始日' : '发生／实施日', dataIndex: 'effectiveDate', width: 120, render: riskDate,
          },
          {
            title: '状态日期', dataIndex: 'statusDate', width: 115, render: riskDate,
          },
          {
            title: type === '减持' ? '计划结束日' : '截止日', dataIndex: 'endDate', width: 115, render: riskDate,
          },
          {
            title: '说明',
            dataIndex: 'detail',
            render: (value, record: any) => (
              <div>
                {record.changeType && (
                <div className="basic-muted">
                  最近变更：
                  {record.changeType}
                </div>
                )}
                <div className="risk-table-summary">{value}</div>
              </div>
            ),
          },
          {
            title: '资料', key: 'detail', width: 100, render: (_, record: any) => <RiskInspect code={record.tsCode} name={record.name} date={date} />,
          },
        ]}
      />
    </BasicShell>
  );
}
export default function Page() { return <Suspense fallback={<Loading />}><Risk /></Suspense>; }
