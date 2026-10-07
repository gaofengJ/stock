'use client';

import Link from '@/components/Interaction';

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Button, Collapse, DatePicker, Grid, Input, Select, Space, Tabs, Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { useSearchParams } from 'next/navigation';
import { errorMessage } from '@/api/errors';
import Table from '@/components/DataTable';
import Loading from '@/components/Loading';
import Layout from '@/components/Layout';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import { getStrategyList, getStrategyTabsList } from '@/api/services';
import { NSGetStrategyList, NSGetStrategyTabsList } from '@/api/services.types';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useDefaultTradeDate } from '@/hooks/useDefaultTradeDate';
import SectorFilter from '@/components/SectorFilter';
import useInsight from './useInsight';
import { strategyColumns, trendColumns } from './columns';
import TrendParameters, { isTrendStrategy, trendDefaults } from './TrendParameters';
import {
  readStrategyOptions, writeStrategyOptions, validStrategyDate, readStrategyTurnover, turnoverQueryKey, turnoverStrategies,
} from './strategy-state';
import TurnoverFilter from './TurnoverFilter';
import CandidateEnvironment from './CandidateEnvironment';
import StrategyRules from './StrategyRules';
import StockChart from './StockChart';
import CandidateProfit, { useCandidateProfit } from './CandidateProfit';
import { RiskTags, StockLink, useWorkbench } from '../basic/components/workbench';
import RiskInspect from '../basic/components/RiskInspect';
import { CandidateComparison, SignalPerformance } from './InsightPanels';
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
  const view = ['candidates', 'comparison', 'performance'].includes(params.get('view') || '') ? params.get('view')! : 'candidates';
  const needsCandidates = view !== 'performance';
  const { user } = useAccount();
  const savedOptions = useRef<Record<string, typeof trendDefaults>>({});
  const [loadedListKey, setLoadedListKey] = useState('');
  const [observation, setObservation] = useState<any>(null);
  const [chartList, setChartList] = useState<any[]>([]);
  const visibleRows = useRef<any[]>([]);
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
  const hasTurnoverFilter = turnoverStrategies.includes(strategy);
  const minTurnoverRateF = readStrategyTurnover(params, strategy);
  const listKey = JSON.stringify([date, strategy, sector, optionKey, hasTurnoverFilter ? minTurnoverRateF : null]);
  const listCurrent = loadedListKey === listKey;
  const loadingCandidates = !loadError && !dateError && (!date || tableLoading || !listCurrent);
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
  const getList = useCallback((force = false) => {
    if (!date || !strategy || !needsCandidates || (!force && loadedListKey === listKey)) return;
    runLatestRequest({
      request: () => getStrategyList({
        date, strategyType: strategy, includeLabels: false, ...(sector ? { sector } : {}), ...(isTrendStrategy(strategy) ? options : {}), ...(hasTurnoverFilter ? { minTurnoverRateF } : {}),
      }, { ...requestConfig, timeout: 90000 }),
      onStart: () => { setLoadError(''); setTableLoading(true); },
      onSuccess: ({ data }) => { setItems(data); setLoadedListKey(listKey); },
      onError: (error) => { setItems([]); setLoadedListKey(listKey); setLoadError(errorMessage(error, '策略加载失败，请重试')); },
      onFinally: () => setTableLoading(false),
    });
  }, [date, strategy, sector, options, requestConfig, runLatestRequest, needsCandidates, listKey, loadedListKey, hasTurnoverFilter, minTurnoverRateF]);
  useEffect(() => { getTabs(); }, [getTabs]);
  useEffect(() => { getList(); }, [getList]);
  useEffect(() => { setSelectedStock(null); setObservation(null); }, [listKey]);
  useEffect(() => {
    if (date && strategy && (!params.get('date') || !params.get('strategyType'))) updateQuery({});
  }, [date, strategy, params, updateQuery]);
  const filtered = (listCurrent ? items : []).filter((row) => (!linkedCode || row.tsCode === linkedCode)
    && (!keyword || `${row.tsCode} ${row.name}`.toLowerCase().includes(keyword.trim().toLowerCase())));
  const riskState = useWorkbench('risk', { date }, !!date && view === 'candidates' && listCurrent && !tableLoading);
  const financials = useCandidateProfit(date, filtered.map((row) => row.tsCode), view === 'candidates' && listCurrent && !tableLoading);
  const labels = useInsight<any[]>('candidate-labels', { date, codes: items.map((row) => row.tsCode).sort() }, needsCandidates && listCurrent && !tableLoading && items.length > 0);
  const labelsMap = new Map(labels.data?.map((row) => [row.tsCode, row]) || []);
  const context = useInsight<any[]>('candidate-context', { date, codes: items.map((row) => row.tsCode).sort() }, view === 'candidates' && visibleColumns.includes('context') && listCurrent && items.length > 0);
  const contextMap = new Map(context.data?.map((row) => [row.tsCode, row]) || []);
  const decorated = filtered.map((row) => ({
    ...row, industry: '', industries: [], topics: [], ...labelsMap.get(row.tsCode), ...contextMap.get(row.tsCode), sectorContextLoading: context.loading, sectorLabelsLoading: labels.loading,
  }));
  const openStock = (row: any, rows?: any[]) => {
    const order = new Map(visibleRows.current.map((r, i) => [r.tsCode, i]));
    const currentRows = rows || [...decorated].sort((a, b) => (order.get(a.tsCode) ?? Infinity) - (order.get(b.tsCode) ?? Infinity));
    setChartList(currentRows); setSelectedStock(row);
  };
  const switchStrategy = (key: string) => {
    savedOptions.current[strategy] = options;
    updateQuery({
      ...writeStrategyOptions(savedOptions.current[key]), strategyType: key, view: 'candidates', code: undefined,
    });
  };
  useEffect(() => {
    if (params.get('view') === 'popularity' && date && allowedPath(user, '/analysis/senti')) window.location.replace(`/analysis/senti/?date=${date}&scope=all&view=popularity${linkedCode ? `&code=${linkedCode}` : ''}#popularity`);
  }, [params, date, user, linkedCode]);
  const columns = [
    ...strategyColumns.slice(0, 2).map((column) => ({
      ...column,
      fixed: 'left' as const,
      width: column.key === 'tsCode' ? 116 : 145,
      render: (value: string, row: any) => <StockLink code={row.tsCode} name={row.name} label={column.key === 'tsCode' ? value.split('.')[0] : value} date={date} onChart={() => openStock(row)} />,
    })),
    {
      title: <Tooltip title="所选交易日之前已披露的最近三个财报期扣非盈亏及最新业绩预告，悬停查看金额">近期业绩</Tooltip>, key: 'profit', width: 260, render: (_: any, row: any) => <CandidateProfit row={financials.rows.get(row.tsCode)} error={financials.error} stopped={financials.stopped} retry={financials.retry} />,
    },
    {
      title: '风险提示', key: 'risks', width: 150, render: (_: any, row: any) => <RiskTags data={riskState.data} code={row.tsCode} date={date} />,
    },
    {
      title: '风险核验', key: 'riskCheck', width: 125, render: (_: any, row: any) => <RiskInspect code={row.tsCode} date={date} />,
    },
    ...trendColumns(strategy),
    ...strategyColumns.slice(2).filter((column) => visibleColumns.includes(String(column.key))),
  ];
  return (
    <Layout showAsideMenu={false} headerMenuActive={EHeaderMenuKey.strategy}>
      <div className="strategy-page p-16 rounded-[6px] bg-bg-white">
        <h1 className="page-heading">策略选股</h1>
        {dateError && !date && <Alert type="error" message={dateError} showIcon action={<Button onClick={retryDate}>重试</Button>} />}
        {loadError && <Alert type="error" message={loadError} showIcon action={<Button onClick={() => { if (navList.length) getList(true); else getTabs(); }}>重试</Button>} />}
        <Tabs size={screens.md ? 'middle' : 'small'} activeKey={strategy} items={navList} onChange={switchStrategy} />
        <div className="strategy-filter-stack">
          <StrategyRules key={strategy} strategy={strategy} options={view === 'performance' ? trendDefaults : options} minTurnoverRateF={view === 'performance' ? 5 : minTurnoverRateF} />
          {hasTurnoverFilter && view !== 'performance' && <TurnoverFilter key={`${strategy}-${minTurnoverRateF}`} value={minTurnoverRateF} onChange={(value) => updateQuery({ [turnoverQueryKey(strategy)]: String(value), code: undefined })} />}
          {isTrendStrategy(strategy) && view !== 'performance' && <TrendParameters key={`${strategy}-${optionKey}`} strategy={strategy} value={options} onChange={(value) => updateQuery({ ...writeStrategyOptions(value), code: undefined })} />}
          <Space size={[24, 12]} wrap>
            <Space>
              <span>{view === 'performance' ? '统计截至' : '交易日期'}</span>
              <DatePicker aria-label="交易日期" value={date ? dayjs(date) : null} allowClear={false} onChange={(value) => { if (value) updateQuery({ date: value.format('YYYY-MM-DD'), code: undefined }); }} />
            </Space>
            <SectorFilter value={sector} onChange={(value) => updateQuery({ sector: value, code: undefined })} />
          </Space>
        </div>
        {view === 'performance' ? <Collapse className="strategy-asof-environment" items={[{ key: 'market', label: `截至日大盘环境，${date}`, children: <CandidateEnvironment date={date} /> }]} /> : <CandidateEnvironment date={date} />}
        <div className="strategy-view-toolbar">
          <Tabs activeKey={view} onChange={(key) => updateQuery({ view: key })} items={[{ key: 'candidates', label: '候选列表' }, { key: 'comparison', label: '横向比较' }, { key: 'performance', label: '历史信号表现' }]} />
          {allowedPath(user, '/analysis/senti') && <Link href={`/analysis/senti/?date=${date}&scope=all&view=popularity#popularity`}>全市场人气榜</Link>}
        </div>
        {(view === 'candidates' || view === 'comparison') && (
        <>
          <div className="strategy-result-toolbar">
            <Space wrap>
              <strong>{tableLoading || !listCurrent ? '正在筛选' : `共筛出 ${items.length} 只`}</strong>
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
          {view === 'candidates' && (loadingCandidates ? <Loading height={240} /> : (
            <Table
              rootClassName="strategy-table"
              rowKey="tsCode"
              dataSource={decorated}
              columns={columns}
              bordered
              bottomSpacing={8}
              locale={{ emptyText: loadError || (keyword || linkedCode ? '当前筛选中未找到该股票' : '当前条件没有符合的股票') }}
              scroll={{ x: 'max-content' }}
              onChange={(_pagination, _filters, _sorter, extra) => { visibleRows.current = extra.currentDataSource; }}
              pagination={false}
            />
          ))}
          {view === 'candidates' && context.error && <Alert type="warning" message={context.error} action={<Button onClick={context.retry}>重试行业／概念表现</Button>} />}
        </>
        )}
        {labels.error && needsCandidates && <Alert type="warning" message={labels.error} action={<Button onClick={labels.retry}>重试行业</Button>} />}
        <div hidden={view !== 'comparison'}><CandidateComparison loadingCandidates={loadingCandidates} date={date} allCandidates={tableLoading || !listCurrent ? [] : items} candidates={tableLoading ? [] : decorated} active={view === 'comparison'} strategies={navList} onStock={openStock} /></div>
        <div hidden={view !== 'performance'}><SignalPerformance date={date} strategy={strategy} sector={sector} active={view === 'performance'} onStock={(row, rows) => { setChartList(rows.map((r) => ({ ...r, tsCode: r.code }))); setObservation({ ...row, tsCode: row.code }); }} /></div>
        <StockChart navigation={chartList} onNavigate={setSelectedStock} stock={selectedStock} date={date} strategy={strategy} options={{ ...options, ...(hasTurnoverFilter ? { minTurnoverRateF } : {}) }} onClose={() => setSelectedStock(null)} />
        <StockChart navigation={chartList} onNavigate={setObservation} stock={observation} date={observation?.date || date} strategy={observation?.studyStrategy || strategy} options={trendDefaults} onClose={() => setObservation(null)} />
      </div>
    </Layout>
  );
}
export default StrategyPage;
