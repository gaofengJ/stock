'use client';

import { Table } from 'antd';
import dayjs from 'dayjs';
import { debounce } from 'lodash-es';
import { useCallback, useEffect, useState } from 'react';

import { getAnalysisLimitsLimitUpList } from '@/api/services';
import { NSGetAnalysisLimitsLimitUpList } from '@/api/services.types';
import CSearchForm from '@/components/common/CSearchForm';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import {
  EAnalysisAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';

import { limitsColumns } from './columns';
import { useLimitsFilterConfigs } from './form-configs';
import './limits.sass';

function AnalysisLimitsPage() {
  const limitsFilterConfigs = useLimitsFilterConfigs();

  // searchParams 的初始值
  const now = dayjs();
  const date = now.hour() >= 20 ? now : now.subtract(1, 'day'); // 20点之前展示前一天，20点之后展示当天
  const initialSearchParams: Partial<NSGetAnalysisLimitsLimitUpList.IParams> = {
    date: date.format('YYYY-MM-DD'),
  };
  const [searchParams, setSearchParams] = useState<Partial<NSGetAnalysisLimitsLimitUpList.IParams>>(
    initialSearchParams,
  );

  const [loading, setLoading] = useState(false);

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

  /**
   * 获取 list
   */
  const getLimits = useCallback(async () => {
    try {
      setLoading(true);
      const { data: items } = await getAnalysisLimitsLimitUpList(
        searchParams as NSGetAnalysisLimitsLimitUpList.IParams,
      );
      setLimitsData((state) => ({
        ...state,
        items: items.map((i) => ({
          // 为 items 的每一项添加 key
          ...i,
          key: i.tsCode,
        })),
      }));
    } catch (e) {
      console.error('e', e);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    const debounceGetLimits = debounce(getLimits, 300);
    debounceGetLimits();

    // 清理函数以防止在组件卸载时继续调用
    return () => {
      debounceGetLimits.cancel();
    };
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
