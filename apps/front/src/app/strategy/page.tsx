'use client';

import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/api/errors';
import {
  Alert, Button, Grid, Table, Tabs,
} from 'antd';
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

const strategyNotes: Record<string, string> = {
  gapThreeUp: '从跳空日起连续三天收阳；不要求收盘逐日上涨。后续允许部分回补，但最低价必须始终高于跳空前一天最高价，触及也排除。',
  gapTwoUp: '从跳空日起连续两天收阳；不要求收盘逐日上涨。后续允许部分回补，但最低价必须始终高于跳空前一天最高价，触及也排除。',
  gapThreeHighTurnover: '从跳空日起三天自由流通换手率均大于5%，且均高于跳空前一天；跳空当天成交额须高于前一天。允许部分回补，但最低价必须始终高于跳空前一天最高价，触及也排除。不要求收阳或收盘逐日上涨。',
  threeDaysHighVol: '三天量比分别大于2.7、1.89、1.53，且三天均收阳。不要求成交量不下降、量比递减或收盘逐日上涨。',
  continuousGap: '连续两天最低价分别高于各自前一天最高价，形成两次完整向上缺口；不要求收阳。',
  shadowWrap: '跳空日上影长度须大于昨收价的3%；次日收阳且收盘突破跳空日最高价。允许部分回补，但反包日最低价必须高于跳空前一天最高价，触及也排除。',
};

function StrategyPage() {
  const screens = Grid.useBreakpoint();
  const [loadError, setLoadError] = useState('');
  const {
    candidate, ready, tradeDate, error: dateError, retry: retryDate,
  } = useDefaultTradeDate();

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

  const [tableLoading, setTableLoading] = useState(true);
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
    onStart: () => { setLoadError(''); setTableLoading(true); },
    onSuccess: ({ data }) => {
      if (!data.length) setTableLoading(false);
      setNavList(data);
      setActivedNav(data[0]?.key || '');
    },
    onError: (error) => {
      setLoadError(errorMessage(error, '策略加载失败，请重试'));
      setTableLoading(false);
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
      onStart: () => { setTableLoading(true); setLoadError(''); },
      onSuccess: ({ data }) => setStrategyData({ items: data }),
      onError: (error) => {
        setLoadError(errorMessage(error, '策略加载失败，请重试'));
        setTableLoading(false);
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
      <div className="p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">策略选股</h1>
        {dateError && <Alert type="error" message={dateError} showIcon action={<Button size="small" onClick={retryDate}>重试</Button>} />}
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={() => { if (navList.length) getStrategy(); else getNavList(); }}>重试</Button>} />}
        <Tabs
          tabPosition="top"
          size={screens.md ? 'middle' : 'small'}
          activeKey={activedNav}
          items={navList}
          onChange={handleClickTabs}
        />
        {strategyNotes[activedNav] && (
          <Alert
            className="mb-16"
            type="info"
            message="筛选规则"
            description={(
              <>
                <div>{strategyNotes[activedNav]}</div>
                <div>共同条件：形态观察期每天成交额严格大于5000万元，排除一字涨停；最后一天收盘不低于当天最高价与最低价的中点。成交量无需逐日增加。</div>
                <div>{activedNav === 'threeDaysHighVol' ? '形态观察期为连续三天。' : '形态观察期从首次跳空日开始，不含跳空前仅作参照的基准日。'}</div>
              </>
            )}
          />
        )}
        {/* 防止内容撑开宽度: w-0 设置了元素的基础宽度为 0，防止内容影响元素的初始宽度。通常，flexbox 元素的宽度会根据内容自动扩展，但 w-0 强制宽度为 0，使得元素完全依赖 flex-grow 进行扩展 */}
        <div className="strategy-results">
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
                  {tableLoading ? '加载中…' : (loadError || '当前日期没有符合该策略的股票')}
                </div>
              ),
            }}
            scroll={{ x: 1048, y: 'max(240px, calc(100dvh - 320px))' }}
            loading={!dateError && (!dateReady || tableLoading)}
            pagination={false}
          />
        </div>
      </div>
    </Layout>
  );
}

export default StrategyPage;
