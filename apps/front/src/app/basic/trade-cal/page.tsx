'use client';

import { useSearchParams } from 'next/navigation';
import { Tabs } from 'antd';
import { useState } from 'react';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';
import EventCalendar from '../components/EventCalendar';
import InvestmentCalendar from '../components/InvestmentCalendar';
import './calendar.css';

export default function BasicTradeCalPage() {
  const params = useSearchParams();
  const [date, setDate] = useState(params.get('date') || dayjs().format('YYYY-MM-DD'));
  const [view, setView] = useState(params.has('code') ? 'events' : 'calendar');
  return (
    <Layout asideMenuItems={basicSiderMenuItems} headerMenuActive={EHeaderMenuKey.basic} asideMenuActive={EBasicAsideMenuKey.basicTradeCal}>
      <div className="calendar-workbench bg-bg-white">
        <h1 className="page-heading">交易与事件日历</h1>
        <Tabs activeKey={view} onChange={setView} items={[{ key: 'calendar', label: '交易与投资日历' }, { key: 'events', label: '公司事件' }]} />
        {view === 'calendar' && <InvestmentCalendar date={date} onDate={setDate} />}
        {view === 'events' && <EventCalendar date={date} onDate={setDate} code={params.get('code') || undefined} />}
      </div>
    </Layout>
  );
}
