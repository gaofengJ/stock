'use client';

import { useSearchParams } from 'next/navigation';
import SectorFilter from '@/components/SectorFilter';
import SectorLinks from '@/components/SectorLinks';
import { errorMessage } from '@/api/errors';
import {
  Alert, Button, PaginationProps, Select, Space, Tooltip,
} from 'antd';
import Table from '@/components/DataTable';
import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EBasicAsideMenuKey, EHeaderMenuKey } from '@/components/Layout/enum';

import { getBasicDailyList } from '@/api/services';
import { NSGetBasicDailyList } from '@/api/services.types';

import CSearchForm from '@/components/common/CSearchForm';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import { StockLink, useWorkbench } from '../components/workbench';

import { useStockFilterConfigs } from './form-configs';
import { dailyColumns } from './columns';

function BasicDailyPage() {
  const url = useSearchParams();
  const defaults = ['tsCode', 'name', 'pctChg', 'close', 'open', 'high', 'low', 'amount', 'turnoverRateF', 'volumeRatio', 'peTtm', 'circMv'];
  const [visible, setVisible] = useState(defaults);
  const [sector, setSector] = useState<string>(); const [scope, setScope] = useState('all'); const [tradingState, setTradingState] = useState('traded');
  const [sort, setSort] = useState<{ orderField?: string; order?: string }>({});
  useEffect(() => { try { const stored = JSON.parse(localStorage.getItem('basic-daily-columns') || 'null'); if (Array.isArray(stored)) setVisible(stored); } catch { /* use defaults */ } }, []);

  const stockFilterConfigs = useStockFilterConfigs();
  const {
    candidate, ready, tradeDate, error: dateError, retry: retryDate,
  } = useDefaultTradeDate();

  // searchParams 的初始值
  const initialSearchParams: Partial<NSGetBasicDailyList.IParams> = {
    pageNum: 1,
    pageSize: 20,
    tradeDate: url.get('date') || candidate,
    tsCode: url.get('tsCode') || undefined,
  };
  const [searchParams, setSearchParams] = useState<
    Partial<NSGetBasicDailyList.IParams>>(initialSearchParams);
  const [dateReady, setDateReady] = useState(false);
  const risk = useWorkbench('risk', { date: searchParams.tradeDate }, dateReady);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const { requestConfig, runLatestRequest } = useLatestRequest('basic-daily-list');

  /**
   * 更新 searchParams 的值
   */
  const handleSetSearchParams = (val: any) => {
    setSearchParams((state) => ({
      ...state,
      ...val,
      pageNum: 1,
      tradeDate: val.tradeDate?.format('YYYY-MM-DD') || state.tradeDate,
    }));
  };

  // dailyData 的初始值
  const initialDailyData: {
    items: NSGetBasicDailyList.IRes['items'];
    totalItems: number;
  } = {
    items: [],
    totalItems: 0,
  };
  const [dailyData, setDailyData] = useState(initialDailyData);

  useEffect(() => {
    if (!ready) return;
    setSearchParams((state) => (
      state.tradeDate === candidate
        ? { ...state, tradeDate }
        : state
    ));
    setDateReady(true);
  }, [candidate, ready, tradeDate]);

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
  const getDailys = useCallback(() => {
    if (!dateReady) return;
    runLatestRequest({
      request: () => getBasicDailyList(
        {
          ...searchParams, sector, scope, tradingState, ...sort,
        } as NSGetBasicDailyList.IParams,
        requestConfig,
      ),
      onStart: () => { setLoading(true); setLoadError(''); },
      onSuccess: ({ data: { items, meta: { totalItems } } }) => {
        setDailyData((state) => ({
          ...state,
          items: items.map((i) => ({ // 为 items 的每一项添加 key
            ...i,
            key: i.tsCode,
          })),
          totalItems,
        }));
      },
      onError: (error) => {
        setLoadError(errorMessage(error, '数据加载失败，请重试'));
        setDailyData({ items: [], totalItems: 0 });
      },
      onFinally: () => setLoading(false),
    });
  }, [dateReady, requestConfig, runLatestRequest, searchParams, sector, scope, tradingState, sort]);

  useEffect(() => {
    getDailys();
  }, [getDailys]);

  return (
    <Layout
      asideMenuItems={basicSiderMenuItems}
      headerMenuActive={EHeaderMenuKey.basic}
      asideMenuActive={EBasicAsideMenuKey.basicDaily}
    >
      <div className="p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">每日交易数据</h1>
        {dateError && <Alert type="error" message={dateError} showIcon action={<Button size="small" onClick={retryDate}>重试</Button>} />}
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={getDailys}>重试</Button>} />}
        <div className="mb-16">
          <CSearchForm
            configs={stockFilterConfigs}
            searchParams={{
              ...searchParams,
              tradeDate: dayjs(searchParams.tradeDate),
            }}
            setSearchParams={handleSetSearchParams}
          />
        </div>
        <Space className="mb-16" wrap>
          <Select aria-label="市场范围" value={scope} onChange={(v) => { setScope(v); setSearchParams((s) => ({ ...s, pageNum: 1 })); }} options={[{ value: 'all', label: '全部A股' }, { value: 'hs', label: '沪深' }, { value: 'main', label: '主板' }, { value: 'gem', label: '创业板' }, { value: 'star', label: '科创板' }, { value: 'bj', label: '北交所' }]} />
          <SectorFilter value={sector} onChange={(v) => { setSector(v); setSearchParams((s) => ({ ...s, pageNum: 1 })); }} />
          <Select aria-label="成交状态" value={tradingState} onChange={(v) => { setTradingState(v); setSearchParams((s) => ({ ...s, pageNum: 1 })); }} options={[{ value: 'traded', label: '有成交记录' }, { value: 'all', label: '全部已取得记录' }]} />
          <Select mode="multiple" aria-label="显示列" maxTagCount={1} style={{ minWidth: 220 }} value={visible} options={dailyColumns.map((c) => ({ label: c.title as string, value: String(c.key) }))} onChange={(v) => { setVisible(v); try { localStorage.setItem('basic-daily-columns', JSON.stringify(v)); } catch { /* storage unavailable */ } }} />
        </Space>
        <p className="basic-muted mb-16">按全部查询结果排序；不把缺失行情补成0。无成交记录不等于停牌，停复牌请查看风险与交易状态。</p>
        <Table
          rowKey="tsCode"
          dataSource={dailyData.items}
          columns={[
            {
              title: '行情状态',
              key: 'quoteState',
              dataIndex: 'quoteState',
              width: 140,
              render: (v: string, row: any) => {
                const event = risk.data?.items?.find((r: any) => r.tsCode === row.tsCode && ['停牌', '复牌'].includes(r.type));
                if (event) {
                  return (
                    <Tooltip title={event.detail}>
                      {event.type}
                      {v === '无成交行情' ? ' / 无行情' : ''}
                    </Tooltip>
                  );
                }
                if (v === '无成交行情') return <Tooltip title={risk.data?.sources?.find((r: any) => r.source === 'suspend_d')?.state === 'ready' ? '未取得行情，且无当日停复牌记录' : '未取得行情，停复牌状态待核实'}>无成交行情</Tooltip>;
                return v;
              },
            },
            ...dailyColumns.filter((c) => ['tsCode', 'name'].includes(String(c.key)) || visible.includes(String(c.key))).map((c) => ({
              ...c,
              sorter: true,
              ...(['tsCode', 'name'].includes(String(c.key)) ? { render: (v: string, row: any) => <StockLink code={row.tsCode} name={v} date={searchParams.tradeDate} /> } : {}),
            })), {
              title: '同花顺行业', key: 'industry', width: 180, render: (_, row) => <SectorLinks stock={row} date={searchParams.tradeDate} />,
            },
          ]}
          onChange={(_, __, sorter, extra) => {
            if (extra.action !== 'sort') return; const s = Array.isArray(sorter) ? sorter[0] : sorter; setSort(s.order ? { orderField: String(s.field), order: s.order === 'ascend' ? 'asc' : 'desc' } : {}); setSearchParams((v) => ({ ...v, pageNum: 1 }));
          }}
          locale={{
            emptyText: (<div className="min-h-240 leading-[240px]">{loading ? '加载中…' : (loadError || '当前日期与筛选条件下暂无数据')}</div>),
          }}
          scroll={{ x: Math.max(1100, visible.length * 130 + 180) }}
          loading={!dateError && (!dateReady || loading)}
          pagination={{
            current: searchParams.pageNum,
            pageSize: searchParams.pageSize,
            total: dailyData.totalItems,
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

export default BasicDailyPage;
