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
import DistributionTatistics from './components/DistributionTatistics';
import { useDateRangeFilterConfigs, useSingleDayFilterConfigs } from './form-configs';
import LimitUpHeight from './components/LimitUpHeight';
import RisingStockCount from './components/RisingStockCount';
import LimitUpComparison from './components/LimitUpComparison';
import LimitBreakComparison from './components/LimitBreakComparison';
import HighOpenRate from './components/HighOpenRate';
import LimitUpSuccessRate from './components/LimitUpSuccessRate';

function AnalysisSentiPage() {
  const now = dayjs();
  const endDate = now.hour() >= 20 ? now : now.subtract(1, 'day'); // 20点之前展示前一天，20点之后展示当天

  // initialSingleDaySearchParams 的初始值
  const initialSingleDaySearchParams = {
    tradeDate: endDate,
  };

  const [singleDaySearchParams, setSingleDaySearchParams] = useState(initialSingleDaySearchParams);

  const singleDayFilterConfigs = useSingleDayFilterConfigs();

  /**
   * 更新 singleDaySearchParams 的值
   */
  const handleSetSingleDaySearchParams = (val: any) => {
    setSingleDaySearchParams((state) => ({
      ...state,
      ...val,
      tradeDate: val.tradeDate.format('YYYY-MM-DD'),
    }));
  };

  const initialDateRangeSearchParams = {
    // 默认时间: [当前时间一个月, 当前时间]
    dateRange: [
      endDate.subtract(1, 'month').format('YYYY-MM-DD'),
      endDate.format('YYYY-MM-DD'),
    ],
  };
  const [dateRangeSearchParams, setDateRangeSearchParams] = useState(initialDateRangeSearchParams);

  /**
   * dateRange 禁用时间
   */
  const disabledDate = (current: Dayjs) => {
    const maxDiff = 90; // 最大日期差
    if (!dateRangeSearchParams.dateRange.length) return false;
    const [startDate, endDate] = dateRangeSearchParams.dateRange;
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

  let dateRangeFilterConfigs = useDateRangeFilterConfigs();
  // 为 dateRange 添加禁用时间
  dateRangeFilterConfigs = dateRangeFilterConfigs.map((i) => {
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
  const handleSetDateRangeSearchParams = (val: any) => {
    setDateRangeSearchParams((state) => ({
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
            configs={singleDayFilterConfigs}
            searchParams={{
              ...singleDaySearchParams,
              dateRange: dayjs(singleDaySearchParams.tradeDate),
            }}
            setSearchParams={handleSetSingleDaySearchParams}
          />
        </div>

        <div className="max-h-[calc(100vh-184px)] overflow-x-hidden overflow-y-auto">
          <Row align="middle" gutter={[32, 64]} justify="space-around">
            <Col span={12}>
              <DistributionTatistics />
            </Col>
          </Row>
        </div>
        <div className="mb-16">
          <CSearchForm
            configs={dateRangeFilterConfigs}
            searchParams={{
              ...dateRangeSearchParams,
              dateRange: dateRangeSearchParams.dateRange.map((i) => dayjs(i)),
            }}
            setSearchParams={handleSetDateRangeSearchParams}
          />
        </div>
        <div className="max-h-[calc(100vh-184px)] overflow-x-hidden overflow-y-auto">
          <Row align="middle" gutter={[32, 64]} justify="space-around">
            <Col span={12}>
              <LimitUpHeight />
            </Col>
            <Col span={12}>
              <RisingStockCount />
            </Col>
            <Col span={12}>
              <LimitUpComparison />
            </Col>
            <Col span={12}>
              <LimitBreakComparison />
            </Col>
            <Col span={12}>
              <HighOpenRate />
            </Col>
            <Col span={12}>
              <LimitUpSuccessRate />
            </Col>
          </Row>
        </div>
      </div>
    </Layout>
  );
}

export default AnalysisSentiPage;
