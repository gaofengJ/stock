'use client';

import { Card, Col, Row } from 'antd';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { MarketSeries } from '@/api/market';
import { quoteColors } from '@/colors';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { useMarket } from '../components/MarketContext';
import { marketHref } from '../components/market-navigation';
import LegacyPage from './LegacyPage';
import MarketCompatibility from '../components/MarketCompatibility';
import MarketShell from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import {
  DataState, Metrics, Trend, TrendRange, SectionTitle, numberText,
} from '../components/MarketCharts';

function SentimentPage() {
  const { date, scope } = useMarket();
  const { user } = useAccount();
  const {
    data, loading, error, retry,
  } = useMarketData<MarketSeries>('sentiment', { days: 730 });
  const s = data?.snapshot;
  const bins = ['≤-9%', ...Array.from({ length: 8 }, (_, i) => `${i - 9}~${i - 8}%`), '-1~0%', '0', '0~1%', ...Array.from({ length: 8 }, (_, i) => `${i + 1}~${i + 2}%`), '≥9%'];
  return (
    <MarketShell title="市场情绪" path="/analysis/senti">
      <DataState loading={loading} error={error} retry={retry} empty={!s}>
        {data && s && (
        <>
          <SectionTitle title="当日情绪" description="涨跌停、炸板为数据源非ST样本。封板率＝涨停／触板，炸板率＝炸板／触板。昨日涨停表现剔除昨日一字板、ST、新股、退市整理及当日无成交样本；该比例不是实际交易胜率。" />
          <Metrics items={[
            {
              title: '涨停家数', className: 'quote-up', value: s.limitUp, suffix: '只', href: allowedPath(user, '/analysis/limits') ? marketHref('/analysis/limits', { date, scope }, { type: 'U' }) : undefined,
            }, {
              title: '跌停家数', className: 'quote-down', value: s.limitDown, suffix: '只', href: allowedPath(user, '/analysis/limits') ? marketHref('/analysis/limits', { date, scope }, { type: 'D' }) : undefined,
            }, {
              title: '炸板家数', value: s.broken, suffix: '只', href: allowedPath(user, '/analysis/limits') ? marketHref('/analysis/limits', { date, scope }, { type: 'Z' }) : undefined,
            },
            {
              title: '最高连板', value: s.maxHeight, suffix: '板', href: allowedPath(user, '/analysis/chains') ? marketHref('/analysis/chains', { date, scope }) : undefined,
            },
            {
              title: '封板率 / 炸板率',
              value: s.sealRate,
              display: `${numberText(s.sealRate)}${s.sealRate == null ? '' : '%'} / ${numberText(s.brokenRate)}${s.brokenRate == null ? '' : '%'}`,
              description: '两者以触板家数为同一分母，合计为100%；无触板样本时显示“—”。',
              note: `触板样本 ${s.limitUp + s.broken} 只`,
            },
            {
              title: '昨日涨停股今日高开率', value: s.highOpenRate, suffix: '%', digits: 2,
            }, {
              title: '昨日涨停股今日上涨率', value: s.riseRate, suffix: '%', digits: 2,
            },
            {
              title: '昨日涨停股今日平均涨幅', signed: true, value: s.averageChange, suffix: '%', digits: 2, note: `昨日涨停表现有效样本 ${s.previousSample} 只`,
            },
          ]}
          />
          <Card
            title={(
              <span className="market-section-title">
                当日涨跌分布
                <HelpTooltip label="当日涨跌分布" title="按所选范围内有成交的A股统计，包含ST。横轴为涨跌幅区间，纵轴为股票家数。" />
              </span>
)}
            className="market-chart"
          >
            <CChart genOptions={() => ({
              tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${numberText(v, 0)}只` },
              grid: {
                left: 50, right: 25, bottom: 70, top: 40,
              },
              xAxis: { type: 'category', data: bins, axisLabel: { rotate: 40 } },
              yAxis: { type: 'value', name: '只', minInterval: 1 },
              series: [{ type: 'bar', data: s.distribution.map((value, i) => ({ value, itemStyle: { color: [quoteColors.down, quoteColors.flat, quoteColors.up][Math.sign(i - 10) + 1] } })) }],
            })}
            />
          </Card>
          <div className="market-section-toolbar">
            <SectionTitle title="历史走势" />
            <TrendRange />
          </div>
          <Row gutter={20}>
            <Col xs={24} lg={12}><Trend title="涨停、跌停与炸板" unit="只" data={data} fields={[{ label: '涨停', value: (v) => v.limitUp }, { label: '跌停', value: (v) => v.limitDown }, { label: '炸板', value: (v) => v.broken }]} /></Col>
            <Col xs={24} lg={12}><Trend title="封板率" data={data} percent average fields={[{ label: '封板率', value: (v) => v.sealRate }]} /></Col>
            <Col xs={24} lg={12}><Trend title="昨日涨停股今日表现" data={data} percent fields={[{ label: '高开率', value: (v) => v.highOpenRate }, { label: '上涨率', value: (v) => v.riseRate }]} /></Col>
            <Col xs={24} lg={12}><Trend title="昨日涨停股今日平均涨幅" data={data} percent average fields={[{ label: '平均涨幅', value: (v) => v.averageChange }]} /></Col>
            <Col xs={24} lg={12}><Trend title="上涨与下跌家数" unit="只" data={data} fields={[{ label: '上涨', value: (v) => v.up }, { label: '下跌', value: (v) => v.down }]} /></Col>
          </Row>
        </>
        )}
      </DataState>
    </MarketShell>
  );
}

export default function Page() {
  return <MarketCompatibility legacy={<LegacyPage />}><SentimentPage /></MarketCompatibility>;
}
