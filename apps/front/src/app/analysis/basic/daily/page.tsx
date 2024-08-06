'use client';

import { PaginationProps, Table } from 'antd';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import { EAnalysisAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicDailyList } from '@/api/services';
import { NSGetBasicDailyList } from '@/api/services.types';

import { dailyColumns } from './columns';

function AnalysisBasicDailyPage() {
  // searchParams 的初始值
  const initialSearchParams: Partial<NSGetBasicDailyList.IParams> = {
    pageNum: 1,
    pageSize: 20,
    tradeDate: dayjs('2024-07-01').format('YYYY-MM-DD'),
  };
  const [searchParams, setSearchParams] = useState<
    Partial<NSGetBasicDailyList.IParams>>(initialSearchParams);

  const [loading, setLoading] = useState(false);

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
  const getDailys = async () => {
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
  };

  useEffect(() => {
    getDailys();
  }, [searchParams]);

  return (
    <Layout
      asideMenuItems={analysisSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.analysis}
      asideMenuActive={EAnalysisAsideMenuKey.analysisBasicDaily}
      asideMenuOpen={EAnalysisAsideMenuKey.analysisBasic}
    >
      <div className="p-16 bg-bg-white">
        <Table
          dataSource={dailyData.items}
          columns={dailyColumns}
          scroll={{ x: 6000, y: 'calc(100vh - 248px)' }}
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

export default AnalysisBasicDailyPage;
