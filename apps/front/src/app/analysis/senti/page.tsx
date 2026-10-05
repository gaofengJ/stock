'use client';

import {
  Card, Col, Row, Tabs,
} from 'antd';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import '../../strategy/strategy.sass';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { MarketSeries } from '@/api/market';
import { quoteColors } from '@/colors';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { PopularityChanges } from '../../strategy/PopularityChanges';
import { useMarket } from '../components/MarketContext';
import { marketHref } from '../components/market-navigation';
import StrongFeedback from '../components/StrongFeedback';
import IntradayCountsChart from '../components/IntradayCountsChart';
import LegacyPage from './LegacyPage';
import MarketCompatibility from '../components/MarketCompatibility';
import MarketShell from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import {
  DataState, Metrics, Trend, TrendRange, SectionTitle, numberText,
} from '../components/MarketCharts';

function SentimentPage() {
  const { date, scope } = useMarket();
  const params = useSearchParams();
  const [view, setView] = useState(params.get('view') === 'popularity' ? 'popularity' : 'sentiment');
  const { user } = useAccount();
  const {
    data, loading, error, retry,
  } = useMarketData<MarketSeries>('sentiment', { days: 730 }, view === 'sentiment');
  const s = data?.snapshot;
  const bins = ['≤-9%', ...Array.from({ length: 8 }, (_, i) => `${i - 9}~${i - 8}%`), '-1~0%', '平盘', '0~1%', ...Array.from({ length: 8 }, (_, i) => `${i + 1}~${i + 2}%`), '≥9%'];
  return (
    <MarketShell title="市场情绪" path="/analysis/senti" scopeFilter={view !== 'popularity'}>
      <Tabs activeKey={view} onChange={setView} items={[{ key: 'sentiment', label: '情绪概览' }, { key: 'popularity', label: '全市场人气榜' }]} />
      {view === 'popularity' ? (
        <div id="popularity">
          <p className="market-note">同花顺全市场日终榜单，仅跟随交易日期，覆盖全市场。</p>
          <PopularityChanges date={date} />
        </div>
      ) : (
        <>
          <DataState loading={loading} error={error} retry={retry} empty={!s}>
            {data && s && (
            <Row gutter={[16, 16]} className="sentiment-snapshot">
              <Col xs={24} xl={10}>
                <Card
                  className="market-chart sentiment-summary"
                  title={(
                    <span className="market-section-title">
                      当日情绪
                      <HelpTooltip label="当日情绪" title="非ST样本。封板率＝收盘涨停家数／盘中触板家数；炸板率＝触板后未封板家数／触板家数。" />
                    </span>
    )}
                >

                  <Metrics items={[
                    {
                      title: '涨停家数', className: 'quote-up', value: s.limitUp, suffix: '只', href: allowedPath(user, '/analysis/limits') ? marketHref('/analysis/limits', { date, scope }, { type: 'U' }) : undefined,
                    }, {
                      title: '跌停家数', className: 'quote-down', value: s.limitDown, suffix: '只', href: allowedPath(user, '/analysis/limits') ? marketHref('/analysis/limits', { date, scope }, { type: 'D' }) : undefined,
                    }, {
                      title: '炸板家数', value: s.broken, suffix: '只', href: allowedPath(user, '/analysis/limits') ? marketHref('/analysis/limits', { date, scope }, { type: 'Z' }) : undefined,
                    },
                    {
                      title: '最高连板', description: '截至所选交易日，连续收盘涨停的最高天数。', value: s.maxHeight, suffix: '板', href: allowedPath(user, '/analysis/chains') ? marketHref('/analysis/chains', { date, scope }) : undefined,
                    },
                  ]}
                  />
                  <p className="market-note">
                    封板率
                    {numberText(s.sealRate)}
                    {s.sealRate == null ? '' : '%'}
                    {' '}
                    ／ 炸板率
                    {' '}
                    {numberText(s.brokenRate)}
                    {s.brokenRate == null ? '' : '%'}
                    ，触板样本
                    {s.limitUp + s.broken}
                    {' '}
                    只
                  </p>
                </Card>
              </Col>
              <Col xs={24} xl={14}>
                <Card
                  title={(
                    <span className="market-section-title">
                      当日涨跌分布
                      <HelpTooltip label="当日涨跌分布" title="按所选范围内有成交的A股统计，包含ST。横轴为涨跌幅区间，纵轴为股票家数。" />
                    </span>
    )}
                  className="market-chart"
                >
                  <CChart
                    height={280}
                    genOptions={() => ({
                      tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${numberText(v, 0)}只` },
                      grid: {
                        left: 12, right: 12, bottom: 12, top: 30, containLabel: true,
                      },
                      xAxis: { type: 'category', data: bins, axisLabel: { rotate: 45, interval: 0, fontSize: 10 } },
                      yAxis: { type: 'value', name: '只', minInterval: 1 },
                      series: [{
                        name: '股票家数', type: 'bar', barMaxWidth: 32, data: s.distribution.map((value, i) => ({ value, itemStyle: { color: [quoteColors.down, quoteColors.flat, quoteColors.up][Math.sign(i - 10) + 1] } })),
                      }],
                    })}
                  />
                </Card>
              </Col>
            </Row>
            )}
          </DataState>
          <IntradayCountsChart />
          <StrongFeedback />
          <div aria-busy={loading} aria-hidden={loading || !!error} className={`market-data-content${loading || error ? ' is-pending' : ''}`}>
            {data && s && (
            <>
              <div className="market-section-toolbar">
                <SectionTitle title="历史走势" />
                <TrendRange />
              </div>
              <Row gutter={[16, 0]}>
                <Col xs={24} lg={12}><Trend title="上涨与下跌家数" description="所选市场范围内有成交的股票，包含ST。" unit="只" data={data} average fields={[{ label: '上涨', value: (v) => v.up }, { label: '下跌', value: (v) => v.down }]} /></Col>
                <Col xs={24} lg={12}><Trend title="涨停、跌停与炸板" unit="只" data={data} average fields={[{ label: '涨停', value: (v) => v.limitUp }, { label: '跌停', value: (v) => v.limitDown }, { label: '炸板', value: (v) => v.broken }]} /></Col>
                <Col xs={24} lg={12}><Trend title="封板率与炸板率" description="以盘中触板家数为分母，分别统计收盘封住涨停、触板后未封板的比例。" data={data} percent average fields={[{ label: '封板率', value: (v) => v.sealRate }, { label: '炸板率', value: (v) => v.brokenRate }]} /></Col>
                <Col xs={24} lg={12}><Trend title="最高连板" unit="板" data={data} average fields={[{ label: '最高连板', value: (v) => v.maxHeight }]} /></Col>
                <Col xs={24} lg={12}><Trend title="昨日涨停股今日表现" description="高开比例：今开高于昨收；上涨比例：今收高于昨收。仅统计今日有有效行情的昨日涨停股。" data={data} percent average fields={[{ label: '高开比例', value: (v) => v.highOpenRate }, { label: '上涨比例', value: (v) => v.riseRate }]} /></Col>
                <Col xs={24} lg={12}><Trend title="昨日涨停股今日平均涨幅" data={data} percent average fields={[{ label: '平均涨幅', value: (v) => v.averageChange }]} /></Col>
              </Row>
            </>
            )}
          </div>
        </>
      )}
    </MarketShell>
  );
}

export default function Page() {
  return <MarketCompatibility legacy={<LegacyPage />}><SentimentPage /></MarketCompatibility>;
}
