import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { Col, Row, Spin } from 'antd';
import CSearchForm from '@/components/common/CSearchForm';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';

import { useSingleDayFilterConfigs } from '../form-configs';
import DistributionTatistics from './DistributionTatistics';

function SingleDateSection() {
  const { candidate, ready, tradeDate } = useDefaultTradeDate();

  // initialSearchParams 的初始值
  const initialSearchParams = {
    tradeDate: candidate,
  };

  const [searchParams, setSearchParams] = useState(initialSearchParams);
  const [dateReady, setDateReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setSearchParams((state) => (
      state.tradeDate === candidate ? { ...state, tradeDate } : state
    ));
    setDateReady(true);
  }, [candidate, ready, tradeDate]);

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
    <div className="mb-32">
      <div className="mb-16">
        <CSearchForm
          configs={filterConfigs}
          searchParams={{
            ...searchParams,
            tradeDate: dayjs(searchParams.tradeDate),
          }}
          setSearchParams={handleSetSearchParams}
        />
      </div>

      <div>
        {dateReady ? (
          <Row align="middle" gutter={[32, 64]} justify="space-around">
            <Col span={12}>
              <DistributionTatistics tradeDate={searchParams.tradeDate} />
            </Col>
            <Col span={12} />
          </Row>
        ) : (
          <Spin className="w-full h-320 !leading-[320px]" size="large" />
        )}
      </div>
    </div>
  );
}

export default SingleDateSection;
