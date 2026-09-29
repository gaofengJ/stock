'use client';

import { Card, Col, Row } from 'antd';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { MarketSeries } from '@/api/market';
import LegacyPage from './LegacyPage';
import MarketCompatibility from '../components/MarketCompatibility';
import MarketShell from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import {
  DataState, Metrics, Trend, TrendRange, SectionTitle, numberText,
} from '../components/MarketCharts';

function SentimentPage() {
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
            { title: '涨停家数', className: 'quote-up', value: s.limitUp }, { title: '跌停家数', className: 'quote-down', value: s.limitDown }, { title: '炸板家数', value: s.broken }, { title: '最高连板', value: s.maxHeight, suffix: '板' },
            {
              title: '封板率', value: s.sealRate, suffix: '%', digits: 2,
            }, {
              title: '炸板率', value: s.brokenRate, suffix: '%', digits: 2,
            },
            {
              title: '昨日涨停股今日高开率', value: s.highOpenRate, suffix: '%', digits: 2,
            }, {
              title: '昨日涨停股今日上涨率', value: s.riseRate, suffix: '%', digits: 2,
            },
            {
              title: '昨日涨停股今日平均涨幅', signed: true, value: s.averageChange, suffix: '%', digits: 2,
            }, { title: '昨日涨停表现有效样本', value: s.previousSample, suffix: '只' },
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
              series: [{ type: 'bar', data: s.distribution.map((value, i) => ({ value, itemStyle: { color: ['#16835b', '#697386', '#d92d53'][Math.sign(i - 10) + 1] } })) }],
            })}
            />
          </Card>
          <div className="market-section-toolbar">
            <SectionTitle title="历史走势" />
            <TrendRange />
          </div>
          <Row gutter={20}>
            <Col xs={24} lg={12}><Trend title="涨停、跌停与炸板" unit="只" data={data} fields={[{ label: '涨停', value: (v) => v.limitUp }, { label: '跌停', value: (v) => v.limitDown }, { label: '炸板', value: (v) => v.broken }]} /></Col>
            <Col xs={24} lg={12}><Trend title="封板率与炸板率" data={data} percent fields={[{ label: '封板率', value: (v) => v.sealRate }, { label: '炸板率', value: (v) => v.brokenRate }]} /></Col>
            <Col xs={24} lg={12}><Trend title="昨日涨停股今日表现" data={data} percent fields={[{ label: '高开率', value: (v) => v.highOpenRate }, { label: '上涨率', value: (v) => v.riseRate }]} /></Col>
            <Col xs={24} lg={12}><Trend title="昨日涨停股今日平均涨幅" data={data} percent fields={[{ label: '平均涨幅', value: (v) => v.averageChange }]} /></Col>
            <Col xs={24} lg={12}><Trend title="最高连板" unit="板" data={data} fields={[{ label: '连板高度', value: (v) => v.maxHeight }]} /></Col>
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
