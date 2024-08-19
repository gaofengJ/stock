import dayjs from 'dayjs';
import { useState } from 'react';
import { Col, Row } from 'antd';
import CSearchForm from '@/components/common/CSearchForm';

import { useSingleDayFilterConfigs } from '../form-configs';
import DistributionTatistics from './DistributionTatistics';

function SingleDateSection() {
  const now = dayjs();
  const date = now.hour() >= 20 ? now : now.subtract(1, 'day'); // 20点之前展示前一天，20点之后展示当天

  // initialSearchParams 的初始值
  const initialSearchParams = {
    tradeDate: date,
  };

  const [searchParams, setSearchParams] = useState(initialSearchParams);

  const filterConfigs = useSingleDayFilterConfigs();

  /**
   * 更新 SearchParams 的值
   */
  const handleSetSearchParams = (val: any) => {
    setSearchParams((state) => ({
      ...state,
      ...val,
      tradeDate: val.tradeDate.format('YYYY-MM-DD'),
    }));
  };

  return (
    <>
      <div className="mb-16">
        <CSearchForm
          configs={filterConfigs}
          searchParams={{
            ...searchParams,
            dateRange: dayjs(searchParams.tradeDate),
          }}
          setSearchParams={handleSetSearchParams}
        />
      </div>

      <div>
        <Row align="middle" gutter={[32, 64]} justify="space-around">
          <Col span={12}>
            <DistributionTatistics />
          </Col>
        </Row>
      </div>
    </>
  );
}

export default SingleDateSection;
