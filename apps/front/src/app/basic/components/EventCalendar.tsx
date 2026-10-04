'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DatePicker, Input, Select, Space, Tag,
} from 'antd';
import dayjs from 'dayjs';
import Table from '@/components/DataTable';
import SectorFilter from '@/components/SectorFilter';
import { StockLink, SourceState, useWorkbench } from './workbench';

export default function EventCalendar({ date, onDate, code }: { date: string; onDate: (date: string) => void; code?: string }) {
  const [days, setDays] = useState('7'); const [keyword, setKeyword] = useState(code || ''); const [sector, setSector] = useState<string>(); const [type, setType] = useState<string>();
  const state = useWorkbench('events', {
    date, days, keyword, sector,
  });
  return (
    <section>
      <Space className="mb-16" wrap>
        <DatePicker aria-label="事件起始日期" value={dayjs(date)} allowClear={false} onChange={(v) => { if (v) onDate(v.format('YYYY-MM-DD')); }} />
        <Select value={days} onChange={setDays} options={[{ value: '7', label: '未来7天' }, { value: '30', label: '未来30天' }]} />
        <Input.Search placeholder="股票名称／代码" defaultValue={keyword} allowClear onSearch={setKeyword} />
        <SectorFilter value={sector} onChange={setSector} />
        <Select allowClear placeholder="事件类型" style={{ width: 140 }} value={type} onChange={setType} options={['解禁', '财报披露', '业绩预告', '业绩快报', '除权除息'].map((v) => ({ label: v, value: v }))} />
      </Space>
      <SourceState data={state.data} error={state.error} retry={state.retry} />
      <Space wrap className="mb-16">
        <Link href={`/basic/daily/?date=${date}`}>
          查看
          {date}
          {' '}
          行情
        </Link>
        <span>
          下一交易日：
          {state.data?.nextTradeDate || '尚未更新'}
        </span>
      </Space>
      <p className="basic-muted">预约披露日期可能调整；预告、快报按实际公告日列出，不预测尚未公布的事件。展示最近资料，非历史时点回放。</p>
      <Table
        loading={state.loading}
        pagination={false}
        virtual={(state.data?.items?.length || 0) > 300}
        scroll={{ x: 1000 }}
        dataSource={(state.data?.items || []).filter((r: any) => !type || r.type === type)}
        rowKey={(r: any) => `${r.tsCode}-${r.type}-${r.eventDate}-${r.reportDate}-${r.holder_name}-${r.announcedAt}-${r.detail}`}
        columns={[
          { title: '日期', dataIndex: 'eventDate', width: 120 }, {
            title: '股票', key: 'stock', width: 190, render: (_, r: any) => <StockLink code={r.tsCode} name={`${r.name} ${r.tsCode}`} date={date} />,
          },
          {
            title: '事件',
            dataIndex: 'type',
            width: 150,
            render: (v, r: any) => (
              <Space>
                {v}
                {r.provisional && <Tag>预约</Tag>}
              </Space>
            ),
          }, {
            title: '报告期', dataIndex: 'reportDate', width: 120, render: (v) => v || '—',
          }, {
            title: '公告日期', dataIndex: 'announcedAt', width: 120, render: (v) => v || '—',
          }, { title: '内容', dataIndex: 'detail', ellipsis: true },
        ]}
      />
    </section>
  );
}
