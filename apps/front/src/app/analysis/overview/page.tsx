'use client';

import { useState } from 'react';
import {
  Card, Col, Row, Statistic,
} from 'antd';
import CChart from '@/components/CChart';
import { MarketSeries } from '@/api/market';
import MarketShell from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import { DataState, Metrics, Trend } from '../components/MarketCharts';

export default function OverviewPage() {
  const { data, loading, error } = useMarketData<MarketSeries>('overview');
  const [index, setIndex] = useState('000001.SH');
  const snapshot = data?.snapshot;
  const selected = data?.indexes.find((i) => i.code === index);
  return (
    <MarketShell title="大盘概览" path="/analysis/overview">
      <DataState loading={loading} error={error} empty={!snapshot}>
        {data && snapshot && (
        <>
          <Row gutter={[16, 16]} className="market-metrics">
            {data.indexes.map((i) => {
              const point = i.series.find((r) => r.date === data.date);
              return (
                <Col span={6} key={i.code}>
                  <Card size="small" className={`market-index ${index === i.code ? 'active' : ''}`} onClick={() => setIndex(i.code)}>
                    <Statistic title={i.name} value={point?.close ?? '—'} precision={2} />
                    <span style={{ color: (point?.pctChg || 0) >= 0 ? '#d65c6c' : '#389e6c' }}>{point ? `${point.pctChg > 0 ? '+' : ''}${point.pctChg.toFixed(2)}%` : '—'}</span>
                  </Card>
                </Col>
              );
            })}
          </Row>
          <Metrics items={[
            {
              title: '所选范围成交额', value: snapshot.amount, suffix: '亿元', digits: 2,
            },
            {
              title: '较前一交易日', value: data.previousAmount == null ? null : snapshot.amount - data.previousAmount, suffix: '亿元', digits: 2,
            },
            {
              title: '前5日平均成交额', value: data.fiveDayAmount, suffix: '亿元', digits: 2,
            },
            {
              title: '较前5日均额', value: data.fiveDayAmount ? (snapshot.amount / data.fiveDayAmount - 1) * 100 : null, suffix: '%', digits: 2,
            },
            { title: '上涨家数', value: snapshot.up }, { title: '下跌家数', value: snapshot.down },
            { title: '平盘家数', value: snapshot.flat }, {
              title: '上涨占比', value: snapshot.upRatio, suffix: '%', digits: 2,
            },
          ]}
          />
          <Metrics items={data.markets.map((m) => ({
            title: m.scope === 'hs' ? '沪深A股成交额' : '北交所成交额', value: m.amount, suffix: '亿元', digits: 2,
          }))}
          />
          <p className="market-note">成交额按A股日线汇总；涨跌家数包含ST，排除无成交股票。指数卡片显示指数本身的涨跌，成交额统计不叠加指数成分。</p>
          <Card title={`${selected?.name || ''} · 收盘点位`} className="market-chart">
            <CChart genOptions={() => ({
              tooltip: { trigger: 'axis' },
              grid: {
                left: 65, right: 25, bottom: 35, top: 20,
              },
              xAxis: { type: 'category', data: data.series.map((r) => r.date) },
              yAxis: { type: 'value', scale: true },
              series: [{
                type: 'line', showSymbol: false, connectNulls: false, itemStyle: { color: '#d36b83' }, data: data.series.map((r) => selected?.series.find((p) => p.date === r.date)?.close ?? null),
              }],
            })}
            />
          </Card>
          <Trend title="市场成交额（亿元）" data={data} fields={[{ label: '成交额', value: (s) => s.amount }]} />
        </>
        )}
      </DataState>
    </MarketShell>
  );
}
