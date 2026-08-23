import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { Col, Row, Spin } from 'antd';

import CSearchForm from '@/components/common/CSearchForm';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';

import { useDateRangeFilterConfigs } from '../form-configs';
import LimitUpMaxTimesCount from './LimitUpMaxTimesCount';
import UpCount from './UpCount';
import LimitUpDownCompare from './LimitUpDownCompare';
import LimitUpAndZCompare from './LimitUpAndZCompare';
import LimitUpHighOpen from './LimitUpHighOpen';
import LimitUpSuccess from './LimitUpSuccess';

function DateRangeSection() {
  const { candidate, ready, tradeDate } = useDefaultTradeDate();

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

  let filterConfigs = useDateRangeFilterConfigs();
  // 为 dateRange 添加禁用时间
  filterConfigs = filterConfigs.map((i) => {
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
    <>
      <div className="mb-16">
        <CSearchForm
          configs={filterConfigs}
          searchParams={{
            ...searchParams,
            dateRange: searchParams.dateRange.map((i) => dayjs(i)),
          }}
          setSearchParams={handleSetSearchParams}
        />
      </div>
      <div>
        {dateReady ? (
          <Row align="middle" gutter={[32, 64]} justify="space-around">
            <Col span={12}>
              <UpCount dateRange={searchParams.dateRange} />
            </Col>
            <Col span={12}>
              <LimitUpMaxTimesCount dateRange={searchParams.dateRange} />
            </Col>
            <Col span={12}>
              <LimitUpDownCompare dateRange={searchParams.dateRange} />
            </Col>
            <Col span={12}>
              <LimitUpAndZCompare dateRange={searchParams.dateRange} />
            </Col>
            <Col span={12}>
              <LimitUpHighOpen dateRange={searchParams.dateRange} />
            </Col>
            <Col span={12}>
              <LimitUpSuccess dateRange={searchParams.dateRange} />
            </Col>
          </Row>
        ) : (
          <Spin className="w-full h-320 !leading-[320px]" size="large" />
        )}
      </div>
    </>
  );
}

export default DateRangeSection;
