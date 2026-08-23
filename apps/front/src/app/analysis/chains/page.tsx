'use client';

import { Col, Row, Spin } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import {
  EAnalysisAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';
import CSearchForm from '@/components/common/CSearchForm';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { useLimitsFilterConfigs } from './form-configs';
import CountLimitUp1 from './components/CountLimitUp1';
import RateLimitUp0to1 from './components/RateLimitUp0to1';
import CountLimitUp2 from './components/CountLimitUp2';
import RateLimitUp1to2 from './components/RateLimitUp1to2';
import CountLimitUp3 from './components/CountLimitUp3';
import RateLimitUp2to3 from './components/RateLimitUp2to3';
import CountLimitUpAbove4 from './components/CountLimitUpAbove4';
import AmountLimitUp from './components/AmountLimitUp';
import AmountUpgradeLimitUp from './components/AmountUpgradeLimitUp';

function AnalysisChainsPage() {
  const { candidate, ready, tradeDate } = useDefaultTradeDate();
  // searchParams 的初始值
  const initialSearchParams = {
    // 默认时间: [当前时间一个月, 当前时间]
    dateRange: [
      dayjs(candidate).subtract(1, 'month').format('YYYY-MM-DD'),
      candidate,
    ],
  };
  const [searchParams, setSearchParams] = useState(initialSearchParams);
  const [dateReady, setDateReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setSearchParams((state) => (
      state.dateRange[1] === candidate
        ? {
          ...state,
          dateRange: [
            dayjs(tradeDate).subtract(1, 'month').format('YYYY-MM-DD'),
            tradeDate,
          ],
        }
        : state
    ));
    setDateReady(true);
  }, [candidate, ready, tradeDate]);

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
      <div className="p-16 rounded-[6px] bg-bg-white">
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
        <div className="max-h-[calc(100vh-184px)] overflow-x-hidden overflow-y-auto">
          {dateReady ? (
            <Row align="middle" gutter={[32, 64]} justify="space-around">
              <Col span={12}>
                <CountLimitUp1 dateRange={searchParams.dateRange} />
              </Col>
              <Col span={12}>
                <RateLimitUp0to1 dateRange={searchParams.dateRange} />
              </Col>
              <Col span={12}>
                <CountLimitUp2 dateRange={searchParams.dateRange} />
              </Col>
              <Col span={12}>
                <RateLimitUp1to2 dateRange={searchParams.dateRange} />
              </Col>
              <Col span={12}>
                <CountLimitUp3 dateRange={searchParams.dateRange} />
              </Col>
              <Col span={12}>
                <RateLimitUp2to3 dateRange={searchParams.dateRange} />
              </Col>
              <Col span={12}>
                <CountLimitUpAbove4 dateRange={searchParams.dateRange} />
              </Col>
              <Col span={12} />
              <Col span={12}>
                <AmountLimitUp dateRange={searchParams.dateRange} />
              </Col>
              <Col span={12}>
                <AmountUpgradeLimitUp dateRange={searchParams.dateRange} />
              </Col>
            </Row>
          ) : (
            <Spin className="w-full h-320 !leading-[320px]" size="large" />
          )}
        </div>
      </div>
    </Layout>
  );
}

export default AnalysisChainsPage;
