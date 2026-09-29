'use client';

import { errorMessage } from '@/api/errors';
import { Alert, Button, Table } from 'antd';
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
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
      onStart: () => { setLoading(true); setLoadError(''); },
      onSuccess: ({ data }) => {
        setActiveFundsData((state) => ({
          ...state,
          items: data,
        }));
      },
      onError: (error) => {
        setLoadError(errorMessage(error, '数据加载失败，请重试'));
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
        <h1 className="page-heading">游资名录</h1>
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={getActiveFunds}>重试</Button>} />}
        <Table
          locale={{ emptyText: loading ? '加载中…' : (loadError || '没有符合条件的数据') }}
          rootClassName="active-funds-table"
          rowKey="name"
          dataSource={activeFundsData.items}
          columns={activeFundsColumns}
          scroll={{ x: 900, y: 'calc(100dvh - 260px)' }}
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
