'use client';

import { Col, Row } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import {
  EAnalysisAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';
import CSearchForm from '@/components/common/CSearchForm';
import { useLimitsFilterConfigs } from './form-configs';
import CountLimit2 from './components/Statistics';

function AnalysisChainsPage() {
  const limitsFilterConfigs = useLimitsFilterConfigs();

  // searchParams 的初始值
  const initialSearchParams = {
    date: dayjs().format('YYYY-MM-DD'),
  };
  const [searchParams, setSearchParams] = useState(
    initialSearchParams,
  );

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
              date: dayjs(searchParams.date),
            }}
            setSearchParams={handleSetSearchParams}
          />
        </div>
        <Row align="middle" gutter={[16, 32]} justify="space-around">
          <Col xl={{ span: 12 }}>
            <CountLimit2 date={searchParams.date} />
          </Col>
          <Col xl={{ span: 12 }}>{/* <UpNum /> */}</Col>
          <Col xl={{ span: 12 }}>{/* <Sentiment /> */}</Col>
          <Col xl={{ span: 12 }}>{/* <Limits /> */}</Col>
        </Row>
      </div>
    </Layout>
  );
}

export default AnalysisChainsPage;
