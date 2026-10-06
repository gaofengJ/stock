'use client';

import { useState } from 'react';
import Link from '@/components/Interaction';
import {
  Button, DatePicker, Input, Modal, Popover, Select, Space, Tag,
} from 'antd';
import dayjs from 'dayjs';
import Table from '@/components/DataTable';
import SectorFilter from '@/components/SectorFilter';
import { StockLink, SourceState, useWorkbench } from './workbench';
import useCalendarPagination from './useCalendarPagination';

export default function EventCalendar({ date, onDate, code }: { date: string; onDate: (date: string) => void; code?: string }) {
  const [days, setDays] = useState('7'); const [keyword, setKeyword] = useState(code || ''); const [sector, setSector] = useState<string>(); const [type, setType] = useState<string>();
  const [detail, setDetail] = useState<any>(null);
  const { ref, pagination } = useCalendarPagination(JSON.stringify([date, days, keyword, sector, type]));
  const state = useWorkbench('events', {
    date, days, keyword, sector, eventType: type, page: String(pagination.current), pageSize: String(pagination.pageSize),
  });
  return (
    <section className="calendar-events">
      <Space className="calendar-filters" wrap>
        <DatePicker aria-label="公司事件起始日期" value={dayjs(date)} allowClear={false} onChange={(v) => { if (v) onDate(v.format('YYYY-MM-DD')); }} />
        <Select value={days} onChange={setDays} options={[{ value: '7', label: '未来7天' }, { value: '30', label: '未来30天' }]} />
        <Input.Search placeholder="股票名称／代码" defaultValue={keyword} allowClear onSearch={setKeyword} />
        <SectorFilter value={sector} onChange={setSector} />
        <Select allowClear placeholder="事件类型" style={{ width: 140 }} value={type} onChange={setType} options={['解禁', '财报披露', '业绩预告', '业绩快报', '除权除息'].map((v) => ({ label: v, value: v }))} />
      </Space>
      <SourceState data={state.data} error={state.error} retry={state.retry} pollingStopped={state.pollingStopped} />
      <div className="calendar-meta">
        <Space wrap>
          <Link href={`/basic/daily/?date=${date}`}>查看当日行情</Link>
          <span>
            下一交易日：
            {state.data?.nextTradeDate || '未更新'}
          </span>
        </Space>
        <Popover trigger="click" content={<p className="calendar-note">财报预约日期可能调整；预告、快报按公告日列出。解禁按股票及日期汇总，修订公告替换同一股东的旧记录。历史日期按当前可用资料查询。</p>}><Button type="link" size="small">口径说明</Button></Popover>
      </div>
      <div ref={ref}>
        <Table
          loading={state.loading}
          autoHeight
          scroll={{ x: undefined }}
          tableLayout="fixed"
          pagination={{ ...pagination, current: state.data?.meta?.page || pagination.current, total: state.data?.meta?.totalItems || 0 }}
          dataSource={state.data?.items || []}
          rowKey={(r: any) => `${r.tsCode}-${r.type}-${r.eventDate}-${r.reportDate}-${r.announcedAt}-${r.detail}`}
          columns={[
            { title: '日期', dataIndex: 'eventDate', width: 112 },
            {
              title: '股票',
              key: 'stock',
              width: 145,
              render: (_, r: any) => (
                <div>
                  <StockLink code={r.tsCode} name={r.name} date={date} />
                  <small className="calendar-secondary">{r.tsCode}</small>
                </div>
              ),
            },
            {
              title: '事件',
              dataIndex: 'type',
              width: 110,
              render: (v, r: any) => (
                <span>
                  {v}
                  {r.provisional && <Tag className="calendar-reserved">预约</Tag>}
                </span>
              ),
            },
            { title: '内容', dataIndex: 'detail', render: (v) => <span className="calendar-summary" title={v}>{v}</span> },
            {
              title: '', key: 'detail', width: 75, render: (_, r) => <Button size="small" type="link" onClick={() => setDetail(r)}>详情</Button>,
            },
          ]}
        />
      </div>
      <Modal className="calendar-modal" centered title={detail ? `${detail.name} · ${detail.type}` : '公司事件'} open={!!detail} onCancel={() => setDetail(null)} footer={null}>
        {detail && (
        <div className="calendar-detail">
          <p>
            事件日期：
            {detail.eventDate}
            {detail.provisional ? '（预约，可能调整）' : ''}
          </p>
          <p>
            报告期：
            {detail.reportDate || '—'}
            {' '}
            · 公告日期：
            {detail.announcedAt || '—'}
          </p>
          <p>{detail.detail}</p>
        </div>
        )}
      </Modal>
    </section>
  );
}
