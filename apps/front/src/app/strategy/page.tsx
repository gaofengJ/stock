'use client';

import { useCallback, useEffect, useState } from 'react';
import { Table, Tabs } from 'antd';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import { getStrategyList, getStrategyTabsList } from '@/api/services';
import { NSGetStrategyList, NSGetStrategyTabsList } from '@/api/services.types';
import CSearchForm from '@/components/common/CSearchForm';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';

import { useStrategyConfigs } from './form-configs';
import { strategyColumns } from './columns';

import './strategy.sass';

function StrategyPage() {
  const { candidate, ready, tradeDate } = useDefaultTradeDate();

  // initialSearchParams 的初始值
  const initialSearchParams: NSGetStrategyList.IParams = {
    date: candidate,
    strategyType: '',
  };
  const [searchParams, setSearchParams] = useState<NSGetStrategyList.IParams>(initialSearchParams);
  const [dateReady, setDateReady] = useState(false);

  /**
   * 更新 searchParams 的值
   */
  const handleSetSearchParams = (val: any) => {
    setSearchParams((state) => ({
      ...state,
      ...val,
      date: val.date.format('YYYY-MM-DD'),
    }));
  };

  const [tableLoading, setTableLoading] = useState(false);
  const {
    requestConfig: tabsRequestConfig,
    runLatestRequest: runLatestTabsRequest,
  } = useLatestRequest('strategy-tabs');
  const {
    requestConfig: strategyRequestConfig,
    runLatestRequest: runLatestStrategyRequest,
  } = useLatestRequest('strategy-list');

  const [activedNav, setActivedNav] = useState('');
  const [navList, setNavList] = useState<NSGetStrategyTabsList.IRes>([]);

  const limitsFilterConfigs = useStrategyConfigs();

  // limitsData 的初始值
  const initialLimitsData: {
    items: NSGetStrategyList.IRes;
  } = {
    items: [],
  };
  const [strategyData, setStrategyData] = useState(initialLimitsData);

  useEffect(() => {
    if (!ready) return;
    setSearchParams((state) => (
      state.date === candidate ? { ...state, date: tradeDate } : state
    ));
    setDateReady(true);
  }, [candidate, ready, tradeDate]);

  /**
   * 切换左侧 tab
   */
  const handleClickTabs = (activedNav: string) => {
    setActivedNav(activedNav);
  };

  /**
   * 获取 navList
   */
  const getNavList = useCallback(() => runLatestTabsRequest({
    request: () => getStrategyTabsList(tabsRequestConfig),
    onSuccess: ({ data }) => {
      setNavList(data);
      setActivedNav(data[0]?.key || '');
    },
    onError: (error) => {
      console.error(error);
      setNavList([]);
      setActivedNav('');
      setStrategyData({ items: [] });
    },
  }), [runLatestTabsRequest, tabsRequestConfig]);

  const getStrategy = useCallback(() => {
    if (!dateReady || !searchParams.date || !activedNav) return;
    runLatestStrategyRequest({
      request: () => getStrategyList({
        ...searchParams,
        strategyType: activedNav,
      }, strategyRequestConfig),
      onStart: () => setTableLoading(true),
      onSuccess: ({ data }) => setStrategyData({ items: data }),
      onError: (error) => {
        console.error(error);
        setStrategyData({ items: [] });
      },
      onFinally: () => setTableLoading(false),
    });
  }, [
    activedNav,
    dateReady,
    runLatestStrategyRequest,
    searchParams,
    strategyRequestConfig,
  ]);

  useEffect(() => {
    getNavList();
  }, [getNavList]);

  useEffect(() => {
    getStrategy();
  }, [getStrategy]);

  return (
    <Layout showAsideMenu={false} headerMenuActive={EHeaderMenuKey.strategy}>
      <div className="flex p-16 h-full rounded-[6px] bg-bg-white">
        <Tabs
          tabPosition="left"
          size="large"
          items={navList}
          onChange={handleClickTabs}
        />
        {/* 防止内容撑开宽度: w-0 设置了元素的基础宽度为 0，防止内容影响元素的初始宽度。通常，flexbox 元素的宽度会根据内容自动扩展，但 w-0 强制宽度为 0，使得元素完全依赖 flex-grow 进行扩展 */}
        <div className="grow w-0">
          <div className="mb-16">
            <CSearchForm
              configs={limitsFilterConfigs}
              searchParams={{
                ...searchParams,
                date: dayjs(searchParams.date),
              }}
              setSearchParams={handleSetSearchParams}
            />
          </div>
          <Table
            rootClassName="strategy-table"
            rowKey="tsCode"
            dataSource={strategyData.items}
            columns={strategyColumns}
            bordered
            locale={{
              emptyText: (
                <div className="min-h-240 leading-[240px]">
                  当前日期暂无数据
                </div>
              ),
            }}
            scroll={{ x: 1048, y: 'calc(100vh - 232px)' }}
            loading={tableLoading}
            pagination={false}
          />
        </div>
      </div>
    </Layout>
  );
}

export default StrategyPage;
