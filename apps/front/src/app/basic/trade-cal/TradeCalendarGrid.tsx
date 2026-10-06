'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Button, Segmented, Select, Space,
} from 'antd';
import { Lunar } from 'lunar-typescript';
import { NSGetBasicTradeCalList } from '@/api/services.types';
import { monthDates } from './calendar-display';

export default function TradeCalendarGrid({ items, year, onSelect }: {
  items: NSGetBasicTradeCalList.IRes; year: string; onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(dayjs().month());
  const [wide, setWide] = useState(false);
  const [mode, setMode] = useState('year');
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1180px) and (min-height: 1000px)');
    const update = () => setWide(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const statuses = useMemo(() => new Map(items.map((r) => [r.calDate, Number(r.isOpen) === 1])), [items]);
  const annual = wide && mode === 'year';
  const months = annual ? Array.from({ length: 12 }, (_, i) => i) : [month];
  return (
    <div>
      <div className="calendar-view-tools">
        <Space wrap>
          <Segmented aria-label="交易日历视图" value={annual ? 'year' : 'month'} onChange={(v) => setMode(String(v))} options={[{ value: 'year', label: '全年', disabled: !wide }, { value: 'month', label: '按月' }]} />
          {!annual && (
          <Space>
            <Button aria-label="上一个月" disabled={month === 0} onClick={() => setMonth((v) => v - 1)}>‹</Button>
            <Select aria-label="选择月份" value={month} onChange={setMonth} options={Array.from({ length: 12 }, (_, i) => ({ value: i, label: `${i + 1}月` }))} />
            <Button aria-label="下一个月" disabled={month === 11} onClick={() => setMonth((v) => v + 1)}>›</Button>
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
                  <button type="button" key={value} className={`trading-day ${style} ${value === dayjs().format('YYYY-MM-DD') ? 'today' : ''}`} title={`${value} · ${state} · 农历${label}；查看当日事件`} aria-label={`${value} ${state}`} onClick={() => onSelect(value)}>
                    <span>{dayjs(value).date()}</span>
                    {!annual && <small>{label}</small>}
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
