'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button, Col, Empty, Row, Select,
} from 'antd';
import Link from 'next/link';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { MarketSeries } from '@/api/market';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { changeClass, numberText } from '@/utils/format';
import { marketHref } from '../components/market-navigation';
import MarketShell, { scopes } from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import { useMarket } from '../components/MarketContext';
import {
  DataState, Metrics, SectionTitle,
} from '../components/MarketCharts';
import { ChartWindow, pairedIndexCandles, scopeIndexes } from '../components/market-display';
import OverviewIndexChart from '../components/OverviewIndexChart';
import ChartRange from '../components/ChartRange';
import MarketAmountChart from '../components/MarketAmountChart';
import MarketBreadthChart from '../components/MarketBreadthChart';
import IndexComparisonChart from '../components/IndexComparisonChart';
import MarketExtremes from '../components/MarketExtremes';

export default function OverviewPage() {
  const {
    data, loading, error, retry,
  } = useMarketData<MarketSeries>('overview', { days: 730 });
  const { scope, date } = useMarket();
  const { user } = useAccount();
  const [index, setIndex] = useState<string | null>(null);
  const [amountWindow, setAmountWindow] = useState<ChartWindow>({ period: 'day', count: 60 });
  const [window, setWindow] = useState<ChartWindow>({ period: 'day', count: 60 });
  useEffect(() => { setIndex(null); }, [scope]);
  const snapshot = data?.snapshot;
  const indexDates = useMemo(() => data?.series.map((r) => r.date) || [], [data]);
  const indexes = scopeIndexes(data?.indexes || [], scope);
  const selected = indexes.find((i) => i.code === index);
  const visibleIndexes = (selected ? [selected] : indexes).filter((i) => {
    const candles = pairedIndexCandles(i.series, indexDates, window.period);
    const visible = window.count ? candles.slice(-window.count) : candles;
    return visible.some((c) => c.value && c.volume != null);
  });
  const range = scopes.find((s) => s.value === scope)?.label || '';
  return (
    <MarketShell title="大盘概览" path="/analysis/overview">
      <DataState loading={loading} error={error} retry={retry} empty={!snapshot}>
        {data && snapshot && (
          <>
            <div className="market-section-toolbar market-breadth-heading">
              <SectionTitle title="市场概况" description="统计所选范围内有成交的A股，包含ST；与市场情绪的涨跌分布口径一致。" />
              {allowedPath(user, '/analysis/senti') && <Link href={marketHref('/analysis/senti', { date, scope })} className="market-detail-link">查看市场情绪与涨跌分布 →</Link>}
            </div>
            <Metrics items={[
              {
                title: '上涨家数', value: snapshot.up, suffix: '只', className: 'quote-up',
              },
              {
                title: '下跌家数', value: snapshot.down, suffix: '只', className: 'quote-down',
              },
              {
                title: '平盘家数', value: snapshot.flat, suffix: '只', className: 'quote-flat',
              },
              {
                title: '上涨占比', value: snapshot.upRatio, suffix: '%', digits: 2, description: '上涨家数 ÷ 当日有成交股票家数。',
              },
            ]}
            />
            {snapshot.total > 0 && (
            <div className="market-breadth" role="img" aria-label={`上涨${snapshot.up}只，下跌${snapshot.down}只，平盘${snapshot.flat}只`}>
              <span style={{ flexGrow: snapshot.up, background: 'var(--quote-up)' }} />
              <span style={{ flexGrow: snapshot.flat, background: 'var(--text-disabled)' }} />
              <span style={{ flexGrow: snapshot.down, background: 'var(--quote-down)' }} />
            </div>
            )}
            <IndexComparisonChart indexes={indexes} dates={indexDates} />
            <Row gutter={[16, 16]} className="market-amount-section">
              <Col xs={24} lg={12}>
                <MarketAmountChart title={`${range} - 市场成交额`} data={data} dates={indexDates} window={amountWindow} onWindowChange={setAmountWindow} />
              </Col>
              <Col xs={24} lg={12}>
                <MarketBreadthChart range={range} />
              </Col>
              <Col xs={24} lg={12}>
                <MarketExtremes range={range} />
              </Col>
            </Row>
            <SectionTitle title="主要指数" description="选择指数卡片，紧邻展示对应K线和成交量；再次点击恢复全部。" />
            <Row gutter={[16, 16]} className="market-metrics">
              {indexes.map((i) => {
                const point = i.series.find((r) => r.date === data.date);
                const direction = changeClass(point?.pctChg);
                const delta = point?.preClose != null ? point.close - point.preClose : null;
                return (
                  <Col xs={24} sm={12} xl={6} key={i.code}>
                    <button type="button" className={`market-index ${selected?.code === i.code ? 'active' : ''}`} aria-pressed={selected?.code === i.code} aria-label={`查看${i.name}走势`} onClick={() => setIndex((current) => (current === i.code ? null : i.code))}>
                      <div className="market-index-name">{i.name}</div>
                      <div className="metric-value">
                        {numberText(point?.close)}
                      </div>
                      <span className="market-index-change">
                        <span>{numberText(delta, 2, true)}</span>
                        <span className={`market-index-percent ${direction}`}>
                          {direction === 'quote-up' && <ArrowUpOutlined aria-label="上涨" />}
                          {direction === 'quote-down' && <ArrowDownOutlined aria-label="下跌" />}
                          {`${numberText(point?.pctChg, 2, true)}${point ? '%' : ''}`}
                        </span>
                      </span>
                    </button>
                  </Col>
                );
              })}
            </Row>
            <div className="market-section-toolbar">
              <div className="market-chart-selection">
                <SectionTitle title="指数图表" description="上方K线、下方成交量，共用日期与缩放。周/月由日线汇总。" />
                <Select aria-label="选择K线指数" value={selected?.code || 'all'} onChange={(value) => setIndex(value === 'all' ? null : value)} options={[{ value: 'all', label: '全部指数' }, ...indexes.map((i) => ({ value: i.code, label: i.name }))]} style={{ minWidth: 160 }} />
                {selected && <Button size="small" onClick={() => setIndex(null)}>显示全部指数</Button>}
              </div>
              <ChartRange value={window} onChange={setWindow} />
            </div>
            <Row gutter={[16, 16]} className="market-chart-grid">
              {visibleIndexes.map((i) => (
                <Col xs={24} lg={selected ? 24 : 12} key={i.code}>
                  <OverviewIndexChart index={i} dates={indexDates} window={window} />
                </Col>
              ))}
              {!visibleIndexes.length && <Col span={24}><div className="market-empty"><Empty description="该范围暂无完整K线与成交量数据" /></div></Col>}
            </Row>
          </>
        )}
      </DataState>
    </MarketShell>
  );
}
