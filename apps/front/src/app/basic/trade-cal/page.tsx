'use client';

import Loading from '@/components/Loading';
import { useSearchParams } from 'next/navigation';

import { errorMessage } from '@/api/errors';
import { Alert, Button, Tabs } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicTradeCalList } from '@/api/services';
import { NSGetBasicTradeCalList } from '@/api/services.types';
import { useLatestRequest } from '@/hooks/useLatestRequest';

import CSearchForm from '@/components/common/CSearchForm';
import EventCalendar from '../components/EventCalendar';
import { useTradeCalConfigs } from './form-configs';
import './limits.sass';

const TradeCalendarGrid = dynamic(() => import('./TradeCalendarGrid'), {
  ssr: false,
  loading: () => (
    <Loading />
  ),
});

function BasicTradeCalPage() {
  const params = useSearchParams();
  const [date, setDate] = useState(params.get('date') || dayjs().format('YYYY-MM-DD'));
  const [view, setView] = useState(params.has('date') || params.has('code') ? 'events' : 'calendar');
  // searchParams 的初始值
  const initialSearchParams: NSGetBasicTradeCalList.IParams = {
    year: dayjs().format('YYYY'),
  };
  const [searchParams, setSearchParams] = useState<NSGetBasicTradeCalList.IParams>(initialSearchParams);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { requestConfig, runLatestRequest } = useLatestRequest(
    'basic-trade-calendar',
  );

  // tradeCalData 的初始值
  const initialTradeCalData: {
    items: NSGetBasicTradeCalList.IRes;
  } = {
    items: [],
  };
  const [tradeCalData, setTradeCalData] = useState(initialTradeCalData);

  /**
   * 获取 list
   */
  const getTradeCal = useCallback(
    () => runLatestRequest({
      request: () => getBasicTradeCalList(searchParams, requestConfig),
      onStart: () => {
        setLoading(true); setLoadError('');
        setTradeCalData({ items: [] });
      },
      onSuccess: ({ data }) => {
        setTradeCalData((state) => ({
          ...state,
          items: data,
        }));
      },
      onError: (error) => setLoadError(errorMessage(error, '数据加载失败，请重试')),
      onFinally: () => setLoading(false),
    }),
    [requestConfig, runLatestRequest, searchParams],
  );

  useEffect(() => {
    getTradeCal();
  }, [getTradeCal]);

  const tradeCalConfigs = useTradeCalConfigs();

  /**
   * 更新 searchParams 的值
   */
  const handleSetSearchParams = (val: any) => {
    setSearchParams((state) => ({
      ...state,
      ...val,
      pageNum: 1,
      year: val.year.format('YYYY'),
    }));
  };

  return (
    <Layout
      asideMenuItems={basicSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.basic}
      asideMenuActive={EBasicAsideMenuKey.basicTradeCal}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">交易与事件日历</h1>
        <Tabs activeKey={view} onChange={setView} items={[{ key: 'calendar', label: '交易日历' }, { key: 'events', label: '事件日历' }]} />
        {view === 'events' && <EventCalendar date={date} onDate={setDate} code={params.get('code') || undefined} />}
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={getTradeCal}>重试</Button>} />}
        <div className="mb-16" style={{ display: view === 'calendar' ? undefined : 'none' }}>
          <CSearchForm
            configs={tradeCalConfigs}
            searchParams={{
              ...searchParams,
              year: dayjs(searchParams.year),
            }}
            setSearchParams={handleSetSearchParams}
          />
        </div>
        <div className="overflow-y-auto overflow-x-hidden" style={{ display: view === 'calendar' ? undefined : 'none' }}>
          <p className="interaction-hint">圆形标记为交易日，未标记为休市，“?”为尚未更新。选择日期，在本页切换至该日事件日历。</p>
          {!loadError && (loading ? (
            <Loading />
          ) : (
            <TradeCalendarGrid
              items={tradeCalData.items}
              year={searchParams.year}
              onSelect={(value) => { setDate(value); setView('events'); }}
            />
          ))}
        </div>
      </div>
    </Layout>
  );
}

export default BasicTradeCalPage;
