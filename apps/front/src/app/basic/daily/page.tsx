'use client';

import { PaginationProps, Table } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { debounce } from 'lodash-es';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicDailyList } from '@/api/services';
import { NSGetBasicDailyList } from '@/api/services.types';

import CSearchForm from '@/components/common/CSearchForm';

import { useStockFilterConfigs } from './form-configs';
import { dailyColumns } from './columns';

function BasicDailyPage() {
  const stockFilterConfigs = useStockFilterConfigs();

  const now = dayjs();
  const date = now.hour() >= 20 ? now : now.subtract(1, 'day'); // 20点之前展示前一天，20点之后展示当天

  // searchParams 的初始值
  const initialSearchParams: Partial<NSGetBasicDailyList.IParams> = {
    pageNum: 1,
    pageSize: 20,
    tradeDate: date.format('YYYY-MM-DD'),
  };
  const [searchParams, setSearchParams] = useState<
    Partial<NSGetBasicDailyList.IParams>>(initialSearchParams);

  const [loading, setLoading] = useState(false);

  /**
   * 更新 searchParams 的值
   */
  const handleSetSearchParams = (val: any) => {
    setSearchParams((state) => ({
      ...state,
      ...val,
      tradeDate: val.tradeDate.format('YYYY-MM-DD'),
    }));
  };

  // dailyData 的初始值
  const initialDailyData: {
    items: NSGetBasicDailyList.IRes['items'];
    totalItems: number;
  } = {
    items: [],
    totalItems: 0,
  };
  const [dailyData, setDailyData] = useState(initialDailyData);

  /**
   * 切换页码
   */
  const onChange: PaginationProps['onChange'] = (page) => {
    setSearchParams((state) => ({ ...state, pageNum: page }));
  };

  /**
   * 切换每页数量
   */
  const onShowSizeChange: PaginationProps['onShowSizeChange'] = (_, size) => {
    setSearchParams((state) => ({ ...state, pageSize: size }));
  };

  /**
   * 获取 list
   */
  const getDailys = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { items, meta: { totalItems } } } = await getBasicDailyList(
        searchParams as NSGetBasicDailyList.IParams,
      );
      setDailyData((state) => ({
        ...state,
        items: items.map((i) => ({ // 为 items 的每一项添加 key
          ...i,
          key: i.tsCode,
        })),
        totalItems,
      }));
    } catch (e) {
      console.error('e', e);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    const debounceGetDailys = debounce(getDailys, 300);
    debounceGetDailys();

    // 清理函数以防止在组件卸载时继续调用
    return () => {
      debounceGetDailys.cancel();
    };
  }, [getDailys]);

  return (
    <Layout
      asideMenuItems={basicSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.basic}
      asideMenuActive={EBasicAsideMenuKey.basicDaily}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <div className="mb-16">
          <CSearchForm
            configs={stockFilterConfigs}
            searchParams={{
              ...searchParams,
              tradeDate: dayjs(searchParams.tradeDate),
            }}
            setSearchParams={handleSetSearchParams}
          />
        </div>
        <Table
          dataSource={dailyData.items}
          columns={dailyColumns}
          locale={{
            emptyText: (<div className="min-h-240 leading-[240px]">当前日期暂无数据</div>),
          }}
          scroll={{ x: 4000, y: 'calc(100vh - 296px)' }}
          loading={loading}
          pagination={{
            pageSize: searchParams.pageSize,
            total: dailyData.totalItems,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            onChange,
            onShowSizeChange,
          }}
        />
      </div>
    </Layout>
  );
}

export default BasicDailyPage;
