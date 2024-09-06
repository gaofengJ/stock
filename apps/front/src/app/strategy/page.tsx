'use client';

import { useCallback, useEffect, useState } from 'react';
import { Table, Tabs } from 'antd';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import { getStrategyList, getStrategyTabsList } from '@/api/services';
import { NSGetStrategyList, NSGetStrategyTabsList } from '@/api/services.types';
import CSearchForm from '@/components/common/CSearchForm';

import { useStrategyConfigs } from './form-configs';
import { strategyColumns } from './columns';

import './strategy.sass';

function StrategyPage() {
  const now = dayjs();
  const date = now.hour() >= 20 ? now : now.subtract(1, 'day'); // 20点之前展示前一天，20点之后展示当天

  // initialSearchParams 的初始值
  const initialSearchParams: NSGetStrategyList.IParams = {
    date: date.format('YYYY-MM-DD'),
    strategyType: '',
  };
  const [searchParams, setSearchParams] = useState<NSGetStrategyList.IParams>(initialSearchParams);

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

  const [tableLoading, setTableLoading] = useState(false);

  const [activedNav, setActivedNav] = useState('');
  const [navList, setNavList] = useState<NSGetStrategyTabsList.IRes>([]);

  const limitsFilterConfigs = useStrategyConfigs();

  // limitsData 的初始值
  const initialLimitsData: {
    items: NSGetStrategyList.IRes;
  } = {
    items: [],
  };
  const [strategyData, setStrategyData] = useState(initialLimitsData);

  /**
   * 切换左侧 tab
   */
  const handleClickTabs = (activedNav: string) => {
    setActivedNav(activedNav);
  };

  /**
   * 获取 navList
   */
  const getNavList = useCallback(async () => {
    try {
      const { data } = await getStrategyTabsList();
      setNavList(data);
      setActivedNav(data[0].key);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const getStrategy = useCallback(async () => {
    if (!searchParams.date || !activedNav) return;
    try {
      setTableLoading(true);
      const { data } = await getStrategyList({
        ...searchParams,
        strategyType: activedNav,
      });
      setStrategyData({
        items: data,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setTableLoading(false);
    }
  }, [activedNav, searchParams]);

  useEffect(() => {
    getNavList();
  }, [getNavList]);

  useEffect(() => {
    getStrategy();
  }, [getStrategy]);

  return (
    <Layout showAsideMenu={false} headerMenuActive={EHeaderMenuKey.strategy}>
      <div className="flex p-16 h-full rounded-[6px] bg-bg-white">
        <Tabs
          tabPosition="left"
          size="large"
          items={navList}
          onChange={handleClickTabs}
        />
        {/* 防止内容撑开宽度: w-0 设置了元素的基础宽度为 0，防止内容影响元素的初始宽度。通常，flexbox 元素的宽度会根据内容自动扩展，但 w-0 强制宽度为 0，使得元素完全依赖 flex-grow 进行扩展 */}
        <div className="grow w-0">
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
            rootClassName="strategy-table"
            dataSource={strategyData.items}
            columns={strategyColumns}
            bordered
            locale={{
              emptyText: (
                <div className="min-h-240 leading-[240px]">
                  当前日期暂无数据
                </div>
              ),
            }}
            scroll={{ x: '100%' }}
            loading={tableLoading}
            pagination={false}
          />
        </div>
      </div>
    </Layout>
  );
}

export default StrategyPage;
