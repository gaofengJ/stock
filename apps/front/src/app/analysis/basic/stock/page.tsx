'use client';

import { PaginationProps, Table } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { debounce } from 'lodash-es';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import {
  EAnalysisAsideMenuKey,
  EHeaderMenuKey,
} from '@/components/Layout/enum';

import { getBasicStockList } from '@/api/services';
import { NSGetBasicStockList } from '@/api/services.types';

import CSearchForm from '@/components/common/CSearchForm';

import { useStockFilterConfigs } from './form-configs';
import { useStockColumns } from './columns';

function AnalysisBasicStockPage() {
  const stockFilterConfigs = useStockFilterConfigs();
  // searchParams 的初始值
  const initialSearchParams: Partial<NSGetBasicStockList.IParams> = {
    pageNum: 1,
    pageSize: 20,
  };
  const [searchParams, setSearchParams] = useState<Partial<NSGetBasicStockList.IParams>>(initialSearchParams);

  const [loading, setLoading] = useState(false);

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
  const getStocks = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: {
          items,
          meta: { totalItems },
        },
      } = await getBasicStockList(searchParams as NSGetBasicStockList.IParams);
      setStockData((state) => ({
        ...state,
        items: items.map((i) => ({
          // 为 items 的每一项添加 key
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
    const debounceGetStocks = debounce(getStocks, 300);
    debounceGetStocks();

    // 清理函数以防止在组件卸载时继续调用
    return () => {
      debounceGetStocks.cancel();
    };
  }, [getStocks]);

  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisBasicStock}
      asideMenuOpen={EAnalysisAsideMenuKey.analysisBasic}
    >
      <div className="p-16 bg-bg-white">
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

export default AnalysisBasicStockPage;
