'use client';

import { Col, Row } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import {
  EAnalysisAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';
import CSearchForm from '@/components/common/CSearchForm';
import { useLimitsFilterConfigs } from './form-configs';
import CountLimitUp2 from './components/CountLimitUp2';
import RateLimitUp1to2 from './components/RateLimitUp1to2';

function AnalysisChainsPage() {
  // searchParams 的初始值
  const initialSearchParams = {
    // 默认时间: [当前时间一个月, 当前时间]
    dateRange: [
      dayjs().subtract(1, 'month').format('YYYY-MM-DD'),
      dayjs().format('YYYY-MM-DD'),
    ],
  };
  const [searchParams, setSearchParams] = useState(initialSearchParams);

  /**
   * dateRange 禁用时间
   */
  const disabledDate = (current: Dayjs) => {
    const maxDiff = 90; // 最大日期差
    if (!searchParams.dateRange.length) return false;
    const [startDate, endDate] = searchParams.dateRange;
    let tooEarly = false;
    let tooLate = false;
    if (startDate) {
      tooEarly = current.diff(startDate, 'days') > maxDiff;
    }
    if (endDate) {
      tooLate = dayjs(endDate).diff(current, 'days') > maxDiff;
    }
    return tooEarly || tooLate;
  };

  let limitsFilterConfigs = useLimitsFilterConfigs();
  // 为 dateRange 添加禁用时间
  limitsFilterConfigs = limitsFilterConfigs.map((i) => {
    if (i.name === 'dateRange') {
      return {
        ...i,
        attrs: {
          ...i.attrs,
          disabledDate,
        },
      };
    }
    return i;
  });

  /**
   * 更新 searchParams 的值
   */
  const handleSetSearchParams = (val: any) => {
    setSearchParams((state) => ({
      ...state,
      ...val,
      dateRange: val.dateRange.map((i: Dayjs) => i.format('YYYY-MM-DD')),
    }));
  };

  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisChains}
    >
      <div className="p-16 bg-bg-white">
        <div className="mb-16">
          <CSearchForm
            configs={limitsFilterConfigs}
            searchParams={{
              ...searchParams,
              dateRange: searchParams.dateRange.map((i) => dayjs(i)),
            }}
            setSearchParams={handleSetSearchParams}
          />
        </div>
        <Row align="middle" gutter={[16, 32]} justify="space-around">
          <Col xl={{ span: 12 }}>
            <CountLimitUp2 dateRange={searchParams.dateRange} />
          </Col>
          <Col xl={{ span: 12 }}>
            <RateLimitUp1to2 dateRange={searchParams.dateRange} />
          </Col>
          <Col xl={{ span: 12 }}>{/* <Sentiment /> */}</Col>
          <Col xl={{ span: 12 }}>{/* <Limits /> */}</Col>
        </Row>
      </div>
    </Layout>
  );
}

export default AnalysisChainsPage;
