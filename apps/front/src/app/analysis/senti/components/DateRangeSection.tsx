import { Col, Row } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';

import CSearchForm from '@/components/common/CSearchForm';

import { useDateRangeFilterConfigs } from '../form-configs';

import LimitUpAndZCompare from './LimitUpAndZCompare';
import LimitUpDownCompare from './LimitUpDownCompare';
import LimitUpHighOpen from './LimitUpHighOpen';
import LimitUpMaxTimesCount from './LimitUpMaxTimesCount';
import LimitUpSuccess from './LimitUpSuccess';
import UpCount from './UpCount';

function DateRangeSection() {
  const now = dayjs();
  const endDate = now.hour() >= 20 ? now : now.subtract(1, 'day'); // 20点之前展示前一天，20点之后展示当天

  const initialSearchParams = {
    // 默认时间: [当前时间一个月, 当前时间]
    dateRange: [
      endDate.subtract(1, 'month').format('YYYY-MM-DD'),
      endDate.format('YYYY-MM-DD'),
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
      </div>
    </>
  );
}

export default DateRangeSection;
