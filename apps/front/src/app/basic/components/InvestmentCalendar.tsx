'use client';

/* eslint-disable no-bitwise, react/jsx-closing-tag-location -- Stable FNV event ids; nested Collapse content follows local layout. */

import { useEffect, useState } from 'react';
import {
  Alert, Button, Checkbox, Collapse, DatePicker, Empty, Input, Segmented, Space, Spin,
} from 'antd';
import dayjs from 'dayjs';
import { getBasicTradeCalList } from '@/api/services';
import { errorMessage } from '@/api/errors';
import { CalendarMaterial } from '@/app/review/materials-contract';
import TradeCalendarGrid from '../trade-cal/TradeCalendarGrid';
import { isAShareFocusEvent } from '../trade-cal/investment-focus';
import { SourceState, useWorkbench } from './workbench';
import '../trade-cal/calendar.css';

export function eventMaterial(event: any): CalendarMaterial {
  const key = JSON.stringify([event.date, event.time, event.source, event.country, event.title]);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return {
    id: String(hash >>> 0),
    date: event.date,
    title: event.title,
    detail: [event.time, event.country, event.category, event.issuingOrg,
      event.sectors?.length ? `关联板块：${event.sectors.join('、')}` : '',
      ...['previous', 'forecast', 'actual'].map((k, i) => (event[k] == null ? '' : `${['前值', '预测值', '公布值'][i]}：${event[k]}`)),
    ].filter(Boolean).join('；'),
    source: /^https?:\/\//.test(event.url || '') ? event.url : 'https://stock.10jqka.com.cn/fincalendar.shtml',
  };
}
export default function InvestmentCalendar({
  date, onDate, selected, onSelect,
}: {
  date: string; onDate: (value: string) => void; selected?: CalendarMaterial[]; onSelect?: (value: CalendarMaterial[]) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [eventScope, setEventScope] = useState('focus');
  const [trade, setTrade] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const monthStart = dayjs(date).startOf('month').format('YYYY-MM-DD');
  const year = date.slice(0, 4);
  const state = useWorkbench('market-events', { date: monthStart, days: '31' }, visible);
  useEffect(() => {
    let active = true; setError(''); setTrade([]);
    getBasicTradeCalList({ year }, { autoShowError: false }).then((r) => { if (active) setTrade(r.data); }).catch((e) => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [year, attempt]);
  const items = visible ? (state.data?.items || []).filter((r: any) => r.date.startsWith(date.slice(0, 7)) && (eventScope === 'all' || isAShareFocusEvent(r)) && (!keyword.trim() || `${r.title} ${(r.sectors || []).join(' ')}`.includes(keyword.trim()))) : [];
  const counts: Record<string, number> = {};
  items.forEach((item: any) => { counts[item.date] = (counts[item.date] || 0) + 1; });
  const daily = items.filter((item: any) => item.date === date);
  const noMatches = eventScope === 'focus' ? '当天没有匹配的重点事件，可切换“全部事件”查看其余日程' : '当天没有匹配的已公布日程';
  const emptyDescription = state.error || state.data?.sources?.some((s: any) => !['ready', 'unpublished'].includes(s.state)) ? '日程资料尚未完整取得，可重试' : noMatches;
  return (
    <section className="investment-calendar">
      <Space wrap size={12}>
        <DatePicker aria-label="日历日期" value={dayjs(date)} allowClear={false} onChange={(value) => { if (value) onDate(value.format('YYYY-MM-DD')); }} />
        {!onSelect && <Checkbox checked={visible} onChange={(e) => setVisible(e.target.checked)}>显示投资事件</Checkbox>}
        {visible && <Segmented aria-label="投资事件范围" value={eventScope} onChange={(value) => setEventScope(String(value))} options={[{ value: 'focus', label: 'A股重点' }, { value: 'all', label: '全部事件' }]} />}
        {visible && <Input.Search aria-label="搜索日历事件" placeholder="搜索事件或板块" allowClear value={keyword} onChange={(e) => setKeyword(e.target.value)} />}
      </Space>
      {error && <Alert type="warning" message={`交易日状态暂缺：${error}`} action={<Button onClick={() => setAttempt((v) => v + 1)}>重试</Button>} />}
      {visible && <SourceState data={state.data} error={state.error} retry={state.retry} pollingStopped={state.pollingStopped} />}
      {visible && <p className="calendar-focus-note">重点按国内宏观政策、全球关键经济数据和产业关联筛选；切换“全部事件”可查看其余公开日程。全年视图展示交易日状态，选择日期可查看对应月份的投资事件。</p>}
      <TradeCalendarGrid items={trade} year={year} initialMonth={dayjs(date).month()} selected={date} events={counts} onSelect={onDate} />
      {visible && (
        <div className="investment-day">
          <h3>{`${date} ${eventScope === 'focus' ? 'A股重点事件' : '全部投资事件'}（${daily.length}项）`}</h3>
          {state.loading && <Spin aria-label="正在读取投资日历" />}
          {!state.loading && !daily.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />}
          <Collapse items={daily.map((event: any) => {
            const material = eventMaterial(event);
            const included = selected?.some((s) => s.id === material.id);
            return {
              key: material.id,
              label: <span>
                {event.time ? `${event.time} ` : ''}
                {event.title}
              </span>,
              children: <div className="investment-detail">
                <p>{material.detail || '来源未提供补充说明'}</p>
                <a href={material.source} target="_blank" rel="noreferrer">查看原始日程</a>
                {onSelect && <Checkbox checked={included} disabled={!included && (selected?.length || 0) >= 40} onChange={(e) => onSelect(e.target.checked ? [...(selected || []), material] : (selected || []).filter((s) => s.id !== material.id))}>纳入复盘素材</Checkbox>}
              </div>,
            };
          })}
          />
        </div>
      )}
    </section>
  );
}
