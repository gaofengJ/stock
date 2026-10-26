'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Button, DatePicker, Segmented, Select, Space,
} from 'antd';
import { Lunar } from 'lunar-typescript';
import SelectField from '@/components/SelectField';
import { NSGetBasicTradeCalList } from '@/api/services.types';
import { monthDates } from './calendar-display';

export default function TradeCalendarGrid({
  items, year, onSelect, selected, events, initialMonth,
}: {
  items: NSGetBasicTradeCalList.IRes; year: string; onSelect: (date: string) => void; selected?: string; events?: Record<string, number>; initialMonth?: number;
}) {
  const [month, setMonth] = useState(initialMonth ?? dayjs().month());
  const [mode, setMode] = useState(events ? 'month' : 'year');
  const statuses = useMemo(() => new Map(items.map((r) => [r.calDate, Number(r.isOpen) === 1])), [items]);
  useEffect(() => { if (initialMonth !== undefined) setMonth(initialMonth); }, [initialMonth]);
  const annual = mode === 'year';
  const months = annual ? Array.from({ length: 12 }, (_, i) => i) : [month];
  return (
    <div>
      <div className="calendar-view-tools">
        <Space wrap>
          <Segmented aria-label="交易日历视图" value={mode} onChange={(v) => setMode(String(v))} options={[{ value: 'year', label: '全年' }, { value: 'month', label: '按月' }]} />
          {annual && <SelectField label="年份"><DatePicker aria-label="选择日历年份" picker="year" value={dayjs(`${year}-01-01`)} allowClear={false} onChange={(value) => { if (value) onSelect(dayjs(selected || `${year}-01-01`).year(value.year()).format('YYYY-MM-DD')); }} /></SelectField>}
          {!annual && (
          <Space>
            <Button aria-label="上一个月" disabled={month === 0} onClick={() => { setMonth((v) => v - 1); if (events) onSelect(`${year}-${String(month).padStart(2, '0')}-01`); }}>‹</Button>
            <SelectField label="月份"><Select aria-label="选择月份" value={month} onChange={(v) => { setMonth(v); if (events) onSelect(`${year}-${String(v + 1).padStart(2, '0')}-01`); }} options={Array.from({ length: 12 }, (_, i) => ({ value: i, label: `${i + 1}月` }))} /></SelectField>
            <Button aria-label="下一个月" disabled={month === 11} onClick={() => { setMonth((v) => v + 1); if (events) onSelect(`${year}-${String(month + 2).padStart(2, '0')}-01`); }}>›</Button>
          </Space>
          )}
        </Space>
        <div className="calendar-legend">
          <span>
            <i className="open" />
            交易日
          </span>
          <span>
            <i />
            休市
          </span>
          <span>
            <i className="unknown" />
            未更新
          </span>
        </div>
      </div>
      <div className={`trading-months ${annual ? 'annual' : 'monthly'}`}>
        {months.map((m) => (
          <section className="trading-month" key={m} aria-label={`${year}年${m + 1}月`}>
            <h2>
              {m + 1}
              月
            </h2>
            <div className="trading-days weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((d) => <span key={d}>{d}</span>)}</div>
            <div className="trading-days">
              {monthDates(Number(year), m).map((value, i) => {
                // Empty cells represent fixed positions within this month's six-week grid.
                // eslint-disable-next-line react/no-array-index-key
                if (!value) return <span key={`blank-${i}`} />;
                const status = statuses.get(value);
                const lunar = Lunar.fromDate(dayjs(value).toDate());
                const label = lunar.getJieQi() || lunar.getDayInChinese();
                let state = '未更新';
                let style = 'unknown';
                if (status !== undefined) { state = status ? '交易日' : '休市'; style = status ? 'open' : 'closed'; }
                return (
                  <button type="button" key={value} className={`trading-day ${style} ${value === dayjs().format('YYYY-MM-DD') ? 'today' : ''}`} title={`${value} ${state} 农历${label}；查看当日事件`} aria-pressed={selected === value} aria-label={`${value} ${state}`} onClick={() => onSelect(value)}>
                    <span>{dayjs(value).date()}</span>
                    {!annual && <small>{events?.[value] ? `${events[value]} 项事件` : label}</small>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
