'use client';

import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { Table } from 'antd';
import CSearchForm from '@/components/common/CSearchForm';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import {
  EAnalysisAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';

import { getAnalysisLimitsLimitUpList } from '@/api/services';
import { NSGetAnalysisLimitsLimitUpList } from '@/api/services.types';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';

import { useLimitsFilterConfigs } from './form-configs';
import { limitsColumns } from './columns';
import './limits.sass';

function AnalysisLimitsPage() {
  const limitsFilterConfigs = useLimitsFilterConfigs();
  const { candidate, ready, tradeDate } = useDefaultTradeDate();

  // searchParams 的初始值
  const initialSearchParams: Partial<NSGetAnalysisLimitsLimitUpList.IParams> = {
    date: candidate,
  };
  const [searchParams, setSearchParams] = useState<Partial<NSGetAnalysisLimitsLimitUpList.IParams>>(
    initialSearchParams,
  );
  const [dateReady, setDateReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const { requestConfig, runLatestRequest } = useLatestRequest('analysis-limit-up-list');

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

  // limitsData 的初始值
  const initialLimitsData: {
    items: NSGetAnalysisLimitsLimitUpList.IRes;
  } = {
    items: [],
  };
  const [limitsData, setLimitsData] = useState(initialLimitsData);

  useEffect(() => {
    if (!ready) return;
    setSearchParams((state) => (
      state.date === candidate ? { ...state, date: tradeDate } : state
    ));
    setDateReady(true);
  }, [candidate, ready, tradeDate]);

  /**
   * 获取 list
   */
  const getLimits = useCallback(() => {
    if (!dateReady) return;
    runLatestRequest({
      request: () => getAnalysisLimitsLimitUpList(
        searchParams as NSGetAnalysisLimitsLimitUpList.IParams,
        requestConfig,
      ),
      onStart: () => setLoading(true),
      onSuccess: ({ data: items }) => {
        setLimitsData((state) => ({
          ...state,
          items: items.map((i) => ({
            // 为 items 的每一项添加 key
            ...i,
            key: i.tsCode,
          })),
        }));
      },
      onError: (error) => {
        console.error('e', error);
        setLimitsData({ items: [] });
      },
      onFinally: () => setLoading(false),
    });
  }, [dateReady, requestConfig, runLatestRequest, searchParams]);

  useEffect(() => {
    getLimits();
  }, [getLimits]);

  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisLimits}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
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
          rootClassName="analysis-limits-table"
          dataSource={limitsData.items}
          columns={limitsColumns}
          bordered
          locale={{
            emptyText: (<div className="min-h-240 leading-[240px]">当前日期暂无数据</div>),
          }}
          scroll={{ y: 'calc(100vh - 232px)' }}
          loading={loading}
          pagination={false}
        />
      </div>
    </Layout>
  );
}

export default AnalysisLimitsPage;
