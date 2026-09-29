'use client';

import { errorMessage } from '@/api/errors';
import { Alert, Button, Input } from 'antd';
import Table from '@/components/DataTable';
import {
  Suspense, useCallback, useEffect, useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import Loading from '@/components/Loading';
import { matchingFunds } from '@/utils/active-funds';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicActiveFundsList } from '@/api/services';
import { NSGetBasicActiveFundsList } from '@/api/services.types';
import { useLatestRequest } from '@/hooks/useLatestRequest';

import { useActiveFundsColumns } from './columns';
import './limits.sass';

function BasicActiveFundsPage() {
  const org = useSearchParams().get('org') || '';
  const [keyword, setKeyword] = useState(org);
  useEffect(() => { setKeyword(org); }, [org]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { requestConfig, runLatestRequest } = useLatestRequest('basic-active-funds');

  const activeFundsColumns = useActiveFundsColumns(keyword);

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

  const linkedFunds = keyword === org && org ? matchingFunds(activeFundsData.items, org) : null;
  const filtered = linkedFunds || activeFundsData.items.filter((fund) => [fund.name, ...fund.orgs].some((v) => v.toLowerCase().includes(keyword.trim().toLowerCase())));
  return (
    <Layout
      asideMenuItems={basicSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.basic}
      asideMenuActive={EBasicAsideMenuKey.basicActiveFunds}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">游资名录</h1>
        <Input.Search className="mb-16" allowClear aria-label="搜索游资或营业部" placeholder="游资名称／营业部" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: '100%', maxWidth: 440 }} />
        {!!linkedFunds && (
        <div className="active-funds-context">
          关联营业部：
          {org}
          <Button type="link" onClick={() => setKeyword('')}>查看全部</Button>
        </div>
        )}
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={getActiveFunds}>重试</Button>} />}
        <Table
          key={keyword}
          locale={{ emptyText: loading ? '加载中…' : (loadError || '没有符合条件的数据') }}
          rootClassName="active-funds-table"
          rowKey="name"
          dataSource={filtered}
          columns={activeFundsColumns}
          scroll={{ x: 900 }}
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

export default function Page() {
  return <Suspense fallback={<Loading height="100dvh" />}><BasicActiveFundsPage /></Suspense>;
}
