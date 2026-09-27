'use client';

import { errorMessage } from '@/api/errors';
import { Alert, Button, Spin } from 'antd';
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
import { useTradeCalConfigs } from './form-configs';
import './limits.sass';

const TradeCalendarGrid = dynamic(() => import('./TradeCalendarGrid'), {
  ssr: false,
  loading: () => (
    <Spin className="w-full h-320 !leading-[320px]" size="large" />
  ),
});

function BasicTradeCalPage() {
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
        <h1 className="page-heading">交易日历</h1>
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={getTradeCal}>重试</Button>} />}
        <div className="mb-16">
          <CSearchForm
            configs={tradeCalConfigs}
            searchParams={{
              ...searchParams,
              year: dayjs(searchParams.year),
            }}
            setSearchParams={handleSetSearchParams}
          />
        </div>
        <div className="h-[calc(100vh-176px)] overflow-y-auto overflow-x-hidden">
          {!loadError && (loading ? (
            <Spin className="w-full h-320 !leading-[320px]" size="large" />
          ) : (
            <TradeCalendarGrid
              items={tradeCalData.items}
              year={searchParams.year}
            />
          ))}
        </div>
      </div>
    </Layout>
  );
}

export default BasicTradeCalPage;
