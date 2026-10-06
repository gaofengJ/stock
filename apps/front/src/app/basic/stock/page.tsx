'use client';

import { errorMessage } from '@/api/errors';
import { Alert, Button, PaginationProps } from 'antd';
import Table from '@/components/DataTable';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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

import SectorFilter, { useSectorSelection } from '@/components/SectorFilter';
import { useStockFilterConfigs } from './form-configs';
import { useStockColumns } from './columns';

function BasicStockPage() {
  const { sector, setSector } = useSectorSelection();
  const linkedDate = useSearchParams().get('date') || undefined;
  const linkedStock = useSearchParams().get('tsCode') || '';
  const stockFilterConfigs = useStockFilterConfigs();
  // searchParams 的初始值
  const initialSearchParams: Partial<NSGetBasicStockList.IParams> = {
    pageNum: 1,
    pageSize: 20,
    ...(/^\d{6}\.(SH|SZ|BJ)$/.test(linkedStock) ? { tsCode: linkedStock } : {}),
  };
  const [searchParams, setSearchParams] = useState<Partial<NSGetBasicStockList.IParams>>(initialSearchParams);
  useEffect(() => {
    if (/^\d{6}\.(SH|SZ|BJ)$/.test(linkedStock)) setSearchParams((old) => ({ ...old, tsCode: linkedStock, pageNum: 1 }));
  }, [linkedStock]);

  const [profileAsOf, setProfileAsOf] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { requestConfig, runLatestRequest } = useLatestRequest('basic-stock-list');

  const stockColumns = useStockColumns(linkedDate);

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
    setSearchParams((state) => ({ ...state, pageSize: size, pageNum: 1 }));
  };

  /**
   * 获取 list
   */
  const getStocks = useCallback(() => runLatestRequest({
    request: () => getBasicStockList(
      { ...searchParams, sector, date: linkedDate } as NSGetBasicStockList.IParams,
      requestConfig,
    ),
    onStart: () => { setLoading(true); setLoadError(''); },
    onSuccess: ({ data }) => {
      const { items, meta: { totalItems } } = data;
      setProfileAsOf((data as any).profileAsOf || '');
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
      setLoadError(errorMessage(error, '数据加载失败，请重试'));
      setStockData({ items: [], totalItems: 0 });
    },
    onFinally: () => setLoading(false),
  }), [requestConfig, runLatestRequest, searchParams, sector, linkedDate]);

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
        <h1 className="page-heading">个股基本信息</h1>
        <p className="basic-muted mb-16">
          公司资料更新：
          {profileAsOf || '待确认'}
          ；行业概念按所选日期的可用同花顺快照展示。支持曾用名及北交所新旧代码查询。
        </p>
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={getStocks}>重试</Button>} />}
        <div className="mb-16">
          <div className="mb-16"><SectorFilter value={sector} onChange={(value) => { setSector(value); setSearchParams((old) => ({ ...old, pageNum: 1 })); }} /></div>
          <CSearchForm
            configs={stockFilterConfigs}
            searchParams={searchParams}
            setSearchParams={(value) => setSearchParams((old) => ({ ...old, ...value, pageNum: 1 }))}
          />
        </div>
        <Table
          rowKey="tsCode"
          locale={{ emptyText: loading ? '加载中…' : (loadError || '没有符合条件的数据') }}
          dataSource={stockData.items}
          columns={stockColumns}
          scroll={{ x: 2000 }}
          loading={loading}
          pagination={{
            current: searchParams.pageNum,
            pageSize: searchParams.pageSize,
            total: stockData.totalItems,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            onChange,
            onShowSizeChange,
          }}
        />
      </div>
    </Layout>
  );
}

export default BasicStockPage;
