'use client';

import { PaginationProps, Table } from 'antd';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import { EAnalysisAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicStock } from '@/api/services';
import { NSGetBasicDaily, NSGetBasicStock } from '@/api/services.types';

import { stockColumns } from './columns';

function AnalysisBasicStockPage() {
  // searchParams 的初始值
  const initialSearchParams: Partial<NSGetBasicDaily.IParams> = {
    pageNum: 1,
    pageSize: 20,
  };
  const [searchParams, setSearchParams] = useState<
    Partial<NSGetBasicDaily.IParams>>(initialSearchParams);

  const [loading, setLoading] = useState(false);

  // stockData 的初始值
  const initialStockData: {
    items: NSGetBasicStock.IRes['items'];
    itemCount: number;
  } = {
    items: [],
    itemCount: 0,
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
  const getStocks = async () => {
    try {
      setLoading(true);
      const { data: { items, meta: { itemCount } } } = await getBasicStock(
        searchParams as NSGetBasicStock.IParams,
      );
      setStockData((state) => ({
        ...state,
        items: items.map((i) => ({ // 为 items 的每一项添加 key
          ...i,
          key: i.tsCode,
        })),
        itemCount,
      }));
    } catch (e) {
      console.error('e', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getStocks();
  }, [searchParams]);

  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisBasicStock}
      asideMenuOpen={EAnalysisAsideMenuKey.analysisBasic}
    >
      <div className="p-16 bg-bg-white">
        <Table
          dataSource={stockData.items}
          columns={stockColumns}
          scroll={{ x: 2000, y: 'calc(100vh - 248px)' }}
          loading={loading}
          pagination={{
            pageSize: searchParams.pageSize,
            total: stockData.itemCount,
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
