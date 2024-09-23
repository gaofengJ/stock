'use client';

import { Table } from 'antd';
import { debounce } from 'lodash-es';
import { useCallback, useEffect, useState } from 'react';

import { getBasicActiveFundsList } from '@/api/services';
import { NSGetBasicActiveFundsList } from '@/api/services.types';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { useActiveFundsColumns } from './columns';
import './limits.sass';

function BasicActiveFundsPage() {
  const [loading, setLoading] = useState(false);

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
  const getActiveFunds = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await getBasicActiveFundsList();
      setActiveFundsData((state) => ({
        ...state,
        items: data,
      }));
    } catch (e) {
      console.error('e', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const debounceGetActiveFunds = debounce(getActiveFunds, 300);
    debounceGetActiveFunds();

    // 清理函数以防止在组件卸载时继续调用
    return () => {
      debounceGetActiveFunds.cancel();
    };
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
          dataSource={activeFundsData.items}
          columns={activeFundsColumns}
          scroll={{ y: 'calc(100vh - 180px)' }}
          loading={loading}
          pagination={false}
        />
      </div>
    </Layout>
  );
}

export default BasicActiveFundsPage;
