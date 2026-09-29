'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Col, Row } from 'antd';
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
import { ChartWindow, scopeIndexes } from '../components/market-display';
import IndexChart from '../components/IndexChart';
import ChartRange from '../components/ChartRange';
import MarketAmountChart from '../components/MarketAmountChart';

export default function OverviewPage() {
  const {
    data, loading, error, retry,
  } = useMarketData<MarketSeries>('overview', { days: 730 });
  const { scope, date } = useMarket();
  const { user } = useAccount();
  const [index, setIndex] = useState<string | null>(null);
  const [window, setWindow] = useState<ChartWindow>({ period: 'day', count: 60 });
  useEffect(() => { setIndex(null); }, [scope]);
  const snapshot = data?.snapshot;
  const indexDates = useMemo(() => data?.series.map((r) => r.date) || [], [data]);
  const indexes = scopeIndexes(data?.indexes || [], scope);
  const selected = indexes.find((i) => i.code === index);
  const visibleIndexes = selected ? [selected] : indexes;
  const range = scopes.find((s) => s.value === scope)?.label;
  return (
    <MarketShell title="大盘概览" path="/analysis/overview">
      <DataState loading={loading} error={error} retry={retry} empty={!snapshot}>
        {data && snapshot && (
          <>
            <div className="market-section-toolbar market-breadth-heading">
              <SectionTitle title="市场概况" description="与市场情绪的涨跌分布使用相同日期和范围，包含ST、排除无成交股票。这里看涨跌家数摘要，市场情绪查看幅度分布、历史走势及非ST样本的涨跌停表现。" />
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
            <SectionTitle title="主要指数" description="点击指数可单独查看，再次点击恢复全部。指数行情取其自身样本；主板范围的上证指数、深证成指也包含其他板块样本。" />
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
            <Row gutter={[16, 16]} className="market-amount-section">
              <Col xs={24} lg={12}>
                <MarketAmountChart title={`${range} - 市场成交额`} data={data} dates={indexDates} window={window} onWindowChange={setWindow} />
              </Col>
            </Row>
            <div className="market-section-toolbar">
              <div className="market-chart-selection">
                <SectionTitle title="指数图表" description="选择器同步设置K线、成交量和市场成交额的初始日期范围，各张K线可独立缩放。周/月由日线汇总，首尾周期可能不完整；各指数成交量不能相加作为全市场成交量。" />
                {selected && <Button size="small" onClick={() => setIndex(null)}>显示全部指数</Button>}
              </div>
              <ChartRange value={window} onChange={setWindow} />
            </div>
            <Row gutter={[16, 16]} className="market-chart-grid">
              {visibleIndexes.map((i) => (
                <Col xs={24} lg={12} key={i.code}>
                  <IndexChart index={i} dates={indexDates} window={window} />
                </Col>
              ))}
            </Row>
          </>
        )}
      </DataState>
    </MarketShell>
  );
}
