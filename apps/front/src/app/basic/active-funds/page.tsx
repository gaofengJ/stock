'use client';

import { errorMessage } from '@/api/errors';
import {
  Alert, Button, Input, Modal,
} from 'antd';
import Link from '@/components/Interaction';
import Table from '@/components/DataTable';
import {
  Suspense, useCallback, useEffect, useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import Loading from '@/components/Loading';
import { matchingFunds, normalizeOrg, uniqueFundOrgs } from '@/utils/active-funds';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicActiveFundsList } from '@/api/services';
import { NSGetBasicActiveFundsList } from '@/api/services.types';
import { useLatestRequest } from '@/hooks/useLatestRequest';

import { useActiveFundsColumns } from './columns';
import useCalendarPagination from '../components/useCalendarPagination';
import './limits.sass';

function BasicActiveFundsPage() {
  const org = useSearchParams().get('org') || '';
  const [keyword, setKeyword] = useState(org);
  useEffect(() => { setKeyword(org); }, [org]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { requestConfig, runLatestRequest } = useLatestRequest('basic-active-funds');

  const [detail, setDetail] = useState<NSGetBasicActiveFundsList.IRes[number] | null>(null);
  const activeFundsColumns = useActiveFundsColumns(keyword, setDetail);
  const { ref, pagination } = useCalendarPagination(keyword, 88);

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
      <div className="p-16 rounded-[6px] bg-bg-white active-funds-page">
        <h1 className="page-heading">游资名录</h1>
        <Input.Search className="mb-16" allowClear aria-label="搜索游资或营业部" placeholder="游资名称／营业部" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: '100%', maxWidth: 440 }} />
        {!!linkedFunds && (
        <div className="active-funds-context">
          关联营业部：
          {org}
          <Button type="default" onClick={() => setKeyword('')}>查看全部</Button>
        </div>
        )}
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={getActiveFunds}>重试</Button>} />}
        <p className="active-funds-muted">公开名录中的营业部关联线索，点击席位查看龙虎榜记录；未收录席位不代表没有交易活动。</p>
        <div ref={ref}>
          <Table
            locale={{ emptyText: loading ? '加载中…' : (loadError || '没有符合条件的数据') }}
            rootClassName="active-funds-table"
            rowKey="name"
            dataSource={filtered}
            columns={activeFundsColumns}
            tableLayout="fixed"
            autoHeight
            scroll={{ x: undefined }}
            loading={loading}
            pagination={pagination}
          />
        </div>
        <Modal className="active-funds-modal" centered width={760} open={!!detail} title={detail?.name} footer={null} onCancel={() => setDetail(null)}>
          {detail && (
            <div>
              <h3>简介</h3>
              <p className="active-funds-biography">{detail.desc || '暂无简介'}</p>
              <h3>{`关联营业部／席位（${uniqueFundOrgs(detail.orgs).length}）`}</h3>
              <div className="active-funds-detail-seats">
                {uniqueFundOrgs(detail.orgs).map((seat) => <Link href={`/basic/active-funds/detail/?org=${encodeURIComponent(seat)}`} key={seat} className={`active-funds-org${normalizeOrg(seat) === normalizeOrg(keyword) ? ' is-selected' : ''}`}>{seat}</Link>)}
                {!uniqueFundOrgs(detail.orgs).length && <span className="active-funds-muted">暂无关联席位</span>}
              </div>
            </div>
          )}
        </Modal>
      </div>
    </Layout>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading height="100dvh" />}><BasicActiveFundsPage /></Suspense>;
}
