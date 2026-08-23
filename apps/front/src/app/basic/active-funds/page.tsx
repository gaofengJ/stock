'use client';

import { Table } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicActiveFundsList } from '@/api/services';
import { NSGetBasicActiveFundsList } from '@/api/services.types';
import { useLatestRequest } from '@/hooks/useLatestRequest';

import { useActiveFundsColumns } from './columns';
import './limits.sass';

function BasicActiveFundsPage() {
  const [loading, setLoading] = useState(false);
  const { requestConfig, runLatestRequest } = useLatestRequest('basic-active-funds');

  const activeFundsColumns = useActiveFundsColumns();

  // activeFundsData 的初始值
  const initialActiveFundsData: {
    items: NSGetBasicActiveFundsList.IRes;
  } = {
    items: [],
  };
  const [activeFundsData, setActiveFundsData] = useState(
    initialActiveFundsData,
  );

  /**
   * 获取 list
   */
  const getActiveFunds = useCallback(
    () => runLatestRequest({
      request: () => getBasicActiveFundsList(requestConfig),
      onStart: () => setLoading(true),
      onSuccess: ({ data }) => {
        setActiveFundsData((state) => ({
          ...state,
          items: data,
        }));
      },
      onError: (error) => {
        console.error('e', error);
        setActiveFundsData({ items: [] });
      },
      onFinally: () => setLoading(false),
    }),
    [requestConfig, runLatestRequest],
  );

  useEffect(() => {
    getActiveFunds();
  }, [getActiveFunds]);

  return (
    <Layout
      asideMenuItems={basicSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.basic}
      asideMenuActive={EBasicAsideMenuKey.basicActiveFunds}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <Table
          rootClassName="active-funds-table"
          rowKey="name"
          dataSource={activeFundsData.items}
          columns={activeFundsColumns}
          scroll={{ y: 'calc(100vh - 232px)' }}
          loading={loading}
          pagination={{
            defaultPageSize: 20,
            pageSizeOptions: [20, 50, 100],
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </div>
    </Layout>
  );
}

export default BasicActiveFundsPage;
