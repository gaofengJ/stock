'use client';

import { PaginationProps, Table } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import {
  EBasicAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';

import { getBasicStockList } from '@/api/services';
import { NSGetBasicStockList } from '@/api/services.types';

import CSearchForm from '@/components/common/CSearchForm';
import { useLatestRequest } from '@/hooks/useLatestRequest';

import { useStockFilterConfigs } from './form-configs';
import { useStockColumns } from './columns';

function BasicStockPage() {
  const stockFilterConfigs = useStockFilterConfigs();
  // searchParams 的初始值
  const initialSearchParams: Partial<NSGetBasicStockList.IParams> = {
    pageNum: 1,
    pageSize: 20,
  };
  const [searchParams, setSearchParams] = useState<Partial<NSGetBasicStockList.IParams>>(initialSearchParams);

  const [loading, setLoading] = useState(false);
  const { requestConfig, runLatestRequest } = useLatestRequest('basic-stock-list');

  const stockColumns = useStockColumns();

  // stockData 的初始值
  const initialStockData: {
    items: NSGetBasicStockList.IRes['items'];
    totalItems: number;
  } = {
    items: [],
    totalItems: 0,
  };
  const [stockData, setStockData] = useState(initialStockData);

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
  const getStocks = useCallback(() => runLatestRequest({
    request: () => getBasicStockList(
      searchParams as NSGetBasicStockList.IParams,
      requestConfig,
    ),
    onStart: () => setLoading(true),
    onSuccess: ({ data: { items, meta: { totalItems } } }) => {
      setStockData((state) => ({
        ...state,
        items: items.map((i) => ({
          // 为 items 的每一项添加 key
          ...i,
          key: i.tsCode,
        })),
        totalItems,
      }));
    },
    onError: (error) => {
      console.error('e', error);
      setStockData({ items: [], totalItems: 0 });
    },
    onFinally: () => setLoading(false),
  }), [requestConfig, runLatestRequest, searchParams]);

  useEffect(() => {
    getStocks();
  }, [getStocks]);

  return (
    <Layout
      asideMenuItems={basicSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.basic}
      asideMenuActive={EBasicAsideMenuKey.basicStock}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <div className="mb-16">
          <CSearchForm
            configs={stockFilterConfigs}
            searchParams={searchParams}
            setSearchParams={setSearchParams}
          />
        </div>
        <Table
          dataSource={stockData.items}
          columns={stockColumns}
          scroll={{ x: 2000, y: 'calc(100vh - 296px)' }}
          loading={loading}
          pagination={{
            pageSize: searchParams.pageSize,
            total: stockData.totalItems,
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

export default BasicStockPage;
