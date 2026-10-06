'use client';

import { useState } from 'react';
import {
  Button, DatePicker, Input, Modal, Popover, Select, Space, Tag,
} from 'antd';
import dayjs from 'dayjs';
import Table from '@/components/DataTable';
import { SourceState, useWorkbench } from './workbench';
import useCalendarPagination from './useCalendarPagination';

export default function InvestmentCalendar({ date, onDate }: { date: string; onDate: (v: string) => void }) {
  const [days, setDays] = useState('30'); const [category, setCategory] = useState<string>(); const [country, setCountry] = useState<string>(); const [keyword, setKeyword] = useState(''); const [detail, setDetail] = useState<any>(null);
  const state = useWorkbench('market-events', { date, days });
  const items = (state.data?.items || []).filter((r: any) => (!category || r.category === category) && (!country || r.country === country) && (!keyword || `${r.title} ${r.sectors.join(' ')} ${r.issuingOrg || ''}`.includes(keyword)));
  const countries = Array.from(new Set<string>((state.data?.items || []).map((r: any) => r.country).filter(Boolean))).sort();
  const { ref, pagination } = useCalendarPagination(JSON.stringify([date, days, category, country, keyword]));
  return (
    <section className="calendar-events">
      <Space className="calendar-filters" wrap>
        <DatePicker aria-label="投资日历起始日期" value={dayjs(date)} allowClear={false} onChange={(v) => { if (v) onDate(v.format('YYYY-MM-DD')); }} />
        <Select value={days} onChange={setDays} options={[{ value: '7', label: '未来7天' }, { value: '30', label: '未来30天' }]} />
        <Select aria-label="事件分类" placeholder="全部分类" style={{ width: 150 }} allowClear value={category} onChange={setCategory} options={['科技与展会', '政策与会议', '经济数据', '其他事件'].map((v) => ({ value: v, label: v }))} />
        <Select aria-label="国家或地区" placeholder="国家／地区" style={{ width: 140 }} allowClear value={country} onChange={setCountry} options={countries.map((v) => ({ value: v, label: v }))} />
        <Input.Search placeholder="搜索事件／板块" allowClear onSearch={setKeyword} />
      </Space>
      <SourceState data={state.data} error={state.error} retry={state.retry} pollingStopped={state.pollingStopped} />
      <div className="calendar-meta">
        <span>
          全球财经、政策会议与科技展会 ·
          {date}
          {' '}
          至
          {state.data?.end || dayjs(date).add(Number(days) - 1, 'day').format('YYYY-MM-DD')}
        </span>
        <Popover trigger="click" content={<p className="calendar-note">仅列出来源已发布的日程，后续可能调整。投资事件分类依据标题关键词；关联板块和重要性采用原始资料，未标注时显示“—”。经济数据保留来源时间，未提供时区时不换算。未公布的两会或展会日期不会推测补齐。</p>}><Button size="small" type="link">日程说明</Button></Popover>
      </div>
      <p className="basic-muted calendar-attribution">
        投资事件来源：
        <a href="https://stock.10jqka.com.cn/fincalendar.shtml" target="_blank" rel="noreferrer">同花顺投资日历</a>
        。经济数据的发布机构见详情，来源未提供时不推测。
      </p>
      <div ref={ref}>
        <Table
          loading={state.loading}
          autoHeight
          scroll={{ x: undefined }}
          tableLayout="fixed"
          pagination={pagination}
          locale={{ emptyText: state.data?.sources?.some((r: any) => r.state !== 'ready' && r.state !== 'unpublished') ? '资料尚未就绪，可稍后检查更新' : '所选范围暂无已公布的匹配日程' }}
          dataSource={items}
          rowKey={(r: any) => `${r.date}-${r.time}-${r.country}-${r.title}`}
          columns={[
            {
              title: '日期',
              dataIndex: 'date',
              width: 112,
              render: (v, r: any) => (
                <div>
                  {v}
                  {r.time && <small className="calendar-secondary">{r.time}</small>}
                </div>
              ),
            },
            {
              title: '事件',
              dataIndex: 'title',
              render: (v, r: any) => (
                <div>
                  <span className="calendar-summary" title={v}>{v}</span>
                  <small className="calendar-secondary">
                    {r.category}
                    {r.country ? ` · ${r.country}` : ''}
                  </small>
                </div>
              ),
            },
            {
              title: '关联板块', key: 'sectors', width: 185, render: (_, r: any) => <span className="calendar-summary" title={r.sectors.join('、')}>{r.sectors.join('、') || '—'}</span>,
            },
            {
              title: '重要性', dataIndex: 'importance', width: 75, render: (v) => (v ? <span title="来源标注的重要性">{'★'.repeat(v)}</span> : '—'),
            },
            {
              title: '', key: 'detail', width: 75, render: (_, r) => <Button type="link" size="small" onClick={() => setDetail(r)}>详情</Button>,
            },
          ]}
        />
      </div>
      <Modal className="calendar-modal" centered title="投资事件详情" open={!!detail} onCancel={() => setDetail(null)} footer={null}>
        {detail && (
        <div className="calendar-detail">
          <h3>{detail.title}</h3>
          <p>
            {detail.date}
            {' '}
            {detail.time || ''}
            {' '}
            {detail.country || ''}
          </p>
          <p>
            <Tag>{detail.category}</Tag>
            {detail.issuingOrg || ''}
          </p>
          <p>
            关联板块：
            {detail.sectors.join('、') || '来源未标注'}
          </p>
          {detail.category === '经济数据' && (
          <p>
            前值：
            {detail.previous ?? '—'}
            {' '}
            · 预测值：
            {detail.forecast ?? '—'}
            {' '}
            · 公布值：
            {detail.actual ?? '—'}
          </p>
          )}
          {detail.source === 'investment_calendar' ? (
            <p>
              来源：
              <a href={detail.url} target="_blank" rel="noreferrer">同花顺投资日历 · 查看原始日程</a>
            </p>
          ) : <p>{`发布机构：${detail.issuingOrg || '来源未标注'}`}</p>}
        </div>
        )}
      </Modal>
    </section>
  );
}
