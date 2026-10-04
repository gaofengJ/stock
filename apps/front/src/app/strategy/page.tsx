'use client';

import {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import {
  Alert, Button, DatePicker, Grid, Input, Select, Space, Tabs,
} from 'antd';
import dayjs from 'dayjs';
import { useSearchParams } from 'next/navigation';
import { errorMessage } from '@/api/errors';
import Table from '@/components/DataTable';
import Layout from '@/components/Layout';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import { getStrategyList, getStrategyTabsList } from '@/api/services';
import { NSGetStrategyList, NSGetStrategyTabsList } from '@/api/services.types';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import SectorFilter from '@/components/SectorFilter';
import { strategyColumns, trendColumns } from './columns';
import TrendParameters, { isTrendStrategy, trendDefaults } from './TrendParameters';
import { readStrategyOptions, writeStrategyOptions, validStrategyDate } from './strategy-state';
import CandidateEnvironment from './CandidateEnvironment';
import StrategyRules from './StrategyRules';
import StockChart from './StockChart';
import { RiskTags, StockLink, useWorkbench } from '../basic/components/workbench';
import { CandidateComparison, SignalPerformance, PopularityChanges } from './InsightPanels';
import './strategy.sass';

const defaultColumns = ['pctChg', 'close', 'amount', 'turnoverRateF', 'industry'];

function StrategyPage() {
  const params = useSearchParams();
  const query = params.toString();
  const screens = Grid.useBreakpoint();
  const {
    ready, tradeDate, error: dateError, retry: retryDate,
  } = useDefaultTradeDate();
  const [navList, setNavList] = useState<NSGetStrategyTabsList.IRes>([]);
  const [loadError, setLoadError] = useState('');
  const [tableLoading, setTableLoading] = useState(true);
  const [items, setItems] = useState<NSGetStrategyList.IRes>([]);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [view, setView] = useState(['candidates', 'comparison', 'performance', 'popularity'].includes(params.get('view') || '') ? params.get('view')! : 'candidates');
  const [observation, setObservation] = useState<any>(null);
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const { requestConfig: tabsConfig, runLatestRequest: runTabs } = useLatestRequest('strategy-tabs');
  const { requestConfig, runLatestRequest } = useLatestRequest('strategy-list');
  const strategy = navList.find((row) => row.key === params.get('strategyType'))?.key || navList[0]?.key || '';
  const date = validStrategyDate(params.get('date')) || (ready ? tradeDate : '');
  const sector = params.get('sector') || undefined;
  const keyword = params.get('q') || '';
  const linkedCode = /^\d{6}\.(SH|SZ|BJ)$/.test(params.get('code') || '') ? params.get('code') : null;
  const optionKey = JSON.stringify(readStrategyOptions(params));
  const options = useMemo(() => JSON.parse(optionKey), [optionKey]);
  const updateQuery = useCallback((changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(query);
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    if (!next.has('date') && date) next.set('date', date);
    if (!next.has('strategyType') && strategy) next.set('strategyType', strategy);
    window.history.replaceState(null, '', `?${next}`);
  }, [query, date, strategy]);
  const getTabs = useCallback(() => runTabs({
    request: () => getStrategyTabsList(tabsConfig),
    onSuccess: ({ data }) => { setNavList(data); if (!data.length) setTableLoading(false); },
    onError: (error) => { setLoadError(errorMessage(error, '策略加载失败')); setTableLoading(false); },
  }), [runTabs, tabsConfig]);
  const getList = useCallback(() => {
    if (!date || !strategy) return;
    runLatestRequest({
      request: () => getStrategyList({
        date, strategyType: strategy, ...(sector ? { sector } : {}), ...(isTrendStrategy(strategy) ? options : {}),
      }, { ...requestConfig, timeout: 90000 }),
      onStart: () => { setLoadError(''); setTableLoading(true); },
      onSuccess: ({ data }) => setItems(data),
      onError: (error) => { setItems([]); setLoadError(errorMessage(error, '策略加载失败，请重试')); },
      onFinally: () => setTableLoading(false),
    });
  }, [date, strategy, sector, options, requestConfig, runLatestRequest]);
  useEffect(() => { getTabs(); }, [getTabs]);
  useEffect(() => { getList(); setSelectedStock(null); setObservation(null); }, [getList]);
  useEffect(() => {
    if (date && strategy && (!params.get('date') || !params.get('strategyType'))) updateQuery({});
  }, [date, strategy, params, updateQuery]);
  const filtered = items.filter((row) => (!linkedCode || row.tsCode === linkedCode)
    && (!keyword || `${row.tsCode} ${row.name}`.toLowerCase().includes(keyword.trim().toLowerCase())));
  const riskState = useWorkbench('risk', { date }, !!date);
  const columns = [
    ...strategyColumns.slice(0, 2).map((column) => ({
      ...column,
      fixed: 'left' as const,
      width: column.key === 'tsCode' ? 104 : 120,
      render: (value: string, row: any) => <Button type="link" className="strategy-stock-link" onClick={() => setSelectedStock(row)}>{column.key === 'tsCode' ? value.split('.')[0] : value}</Button>,
    })),
    {
      title: '风险提示', key: 'risks', width: 150, render: (_: any, row: any) => <RiskTags data={riskState.data} code={row.tsCode} date={date} />,
    },
    {
      title: '档案', key: 'profile', width: 70, render: (_: any, row: any) => <StockLink code={row.tsCode} name="资料" date={date} />,
    },
    ...trendColumns(strategy),
    ...strategyColumns.slice(2).filter((column) => visibleColumns.includes(String(column.key))),
  ];
  return (
    <Layout showAsideMenu={false} headerMenuActive={EHeaderMenuKey.strategy}>
      <div className="p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">策略选股</h1>
        {dateError && !date && <Alert type="error" message={dateError} showIcon action={<Button onClick={retryDate}>重试</Button>} />}
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button onClick={() => { if (navList.length) getList(); else getTabs(); }}>重试</Button>} />}
        <Tabs size={screens.md ? 'middle' : 'small'} activeKey={strategy} items={navList} onChange={(key) => updateQuery({ ...writeStrategyOptions(), strategyType: key, code: undefined })} />
        <StrategyRules strategy={strategy} options={options} />
        {isTrendStrategy(strategy) && <TrendParameters key={`${strategy}-${optionKey}`} strategy={strategy} value={options} onChange={(value) => updateQuery({ ...writeStrategyOptions(value), code: undefined })} />}
        <Space className="mb-16" size={[24, 12]} wrap>
          <Space>
            <span>交易日期</span>
            <DatePicker aria-label="交易日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(value) => { if (value) updateQuery({ date: value.format('YYYY-MM-DD'), code: undefined }); }} />
          </Space>
          <SectorFilter value={sector} onChange={(value) => updateQuery({ sector: value, code: undefined })} />
        </Space>
        <CandidateEnvironment date={date} />
        <Tabs activeKey={view} onChange={setView} items={[{ key: 'candidates', label: '候选列表' }, { key: 'comparison', label: '横向比较' }, { key: 'performance', label: '信号后续表现' }, { key: 'popularity', label: '同花顺人气变化' }]} />
        {view === 'popularity' && <Alert type="info" className="mb-16" message="人气榜覆盖全市场，跟随交易日期，不受策略和行业筛选影响。" />}
        {(view === 'candidates' || view === 'comparison') && (
        <>
          <div className="strategy-result-toolbar">
            <Space wrap>
              <strong>{tableLoading ? '正在筛选' : `共筛出 ${items.length} 只`}</strong>
              {(keyword || linkedCode) && (
              <span>
                当前显示
                {filtered.length}
                {' '}
                只
              </span>
              )}
              <Input aria-label="搜索股票" allowClear placeholder="股票代码 / 名称" value={keyword} style={{ width: 220 }} onChange={(event) => updateQuery({ q: event.target.value })} />
            </Space>
            {view === 'candidates' && <Select aria-label="展示列" mode="multiple" maxTagCount={0} maxTagPlaceholder={() => '展示列'} style={{ width: 150 }} value={visibleColumns} onChange={setVisibleColumns} options={strategyColumns.slice(2).map((column) => ({ value: String(column.key), label: String(column.title) }))} />}
          </div>
          {linkedCode && <Alert className="mb-16" type="info" message={`定位股票 ${linkedCode}`} action={<Button onClick={() => updateQuery({ code: undefined })}>显示全部</Button>} />}
          {view === 'candidates' ? (
            <Table
              rootClassName="strategy-table"
              rowKey="tsCode"
              dataSource={filtered}
              columns={columns}
              bordered
              locale={{ emptyText: loadError || (keyword || linkedCode ? '当前筛选中未找到该股票' : '当前条件没有符合的股票') }}
              scroll={{ x: 'max-content' }}
              loading={!dateError && (!date || tableLoading)}
              pagination={false}
            />
          ) : <CandidateComparison key={`${date}-${strategy}-${sector || ''}`} date={date} candidates={tableLoading ? [] : filtered} strategies={navList} onStock={setSelectedStock} />}
        </>
        )}
        {view === 'performance' && <SignalPerformance date={date} strategy={strategy} sector={sector} onStock={(row) => setObservation({ ...row, tsCode: row.code })} />}
        {view === 'popularity' && <PopularityChanges date={date} code={linkedCode} />}
        <StockChart stock={selectedStock} date={date} strategy={strategy} options={options} onClose={() => setSelectedStock(null)} />
        <StockChart stock={observation} date={observation?.date || date} strategy={strategy} options={trendDefaults} onClose={() => setObservation(null)} />
      </div>
    </Layout>
  );
}
export default StrategyPage;
