'use client';

import { useState } from 'react';
import { Card, Col, Row } from 'antd';
import CChart from '@/components/CChart';
import { MarketSeries } from '@/api/market';
import { changeClass, numberText } from '@/utils/format';
import MarketShell, { scopes } from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import { useMarket } from '../components/MarketContext';
import { DataState, Metrics, Trend } from '../components/MarketCharts';

export default function OverviewPage() {
  const {
    data, loading, error, retry,
  } = useMarketData<MarketSeries>('overview');
  const { scope } = useMarket();
  const [index, setIndex] = useState('000001.SH');
  const snapshot = data?.snapshot;
  const selected = data?.indexes.find((i) => i.code === index);
  const difference = snapshot && data?.previousAmount != null ? snapshot.amount - data.previousAmount : null;
  const change = difference != null && data?.previousAmount ? (difference / data.previousAmount) * 100 : null;
  const previousDate = data?.series.filter((r) => r.date < (data.date || '')).at(-1)?.date;
  let differenceText = '—';
  if (difference === 0) differenceText = '持平';
  else if (difference != null) differenceText = `${difference > 0 ? '放量' : '缩量'} ${numberText(Math.abs(difference))}`;
  const range = scopes.find((s) => s.value === scope)?.label;
  return (
    <MarketShell title="大盘概览" path="/analysis/overview">
      <DataState loading={loading} error={error} retry={retry} empty={!snapshot}>
        {data && snapshot && (
          <>
            <h2 className="section-heading">主要指数</h2>
            <Row gutter={[16, 16]} className="market-metrics">
              {data.indexes.map((i) => {
                const point = i.series.find((r) => r.date === data.date);
                return (
                  <Col xs={24} sm={12} xl={6} key={i.code}>
                    <button type="button" className={`market-index ${index === i.code ? 'active' : ''}`} aria-pressed={index === i.code} aria-label={`查看${i.name}走势`} onClick={() => setIndex(i.code)}>
                      <div className="market-index-name">{i.name}</div>
                      <div className="metric-value">
                        {numberText(point?.close)}
                        <span className="metric-unit">点</span>
                      </div>
                      <span className={`market-index-change ${changeClass(point?.pctChg)}`}>
                        {numberText(point?.pctChg, 2, true)}
                        {point ? '%' : ''}
                      </span>
                    </button>
                  </Col>
                );
              })}
            </Row>
            <h2 className="section-heading">成交与量能</h2>
            <Metrics items={[
              {
                title: `${range}成交额`, value: snapshot.amount, suffix: '亿元', digits: 2, description: '按所选范围内A股日线成交额求和，不叠加指数成交额。',
              },
              {
                title: '成交额较上一交易日',
                value: difference,
                suffix: difference === 0 ? '' : '亿元',
                digits: 2,
                display: differenceText,
                note: change == null ? undefined : `变化比例 ${numberText(change, 2, true)}%`,
                description: `${range}：${data.date}成交额减去${previousDate || '上一交易日'}成交额；变化比例以上一交易日为基准。放量、缩量不代表涨跌方向。`,
              },
              {
                title: '前5个交易日平均成交额', value: data.fiveDayAmount, suffix: '亿元', digits: 2, note: '不含所选交易日', description: '所选交易日前5个交易日成交额的算术平均值；不足5日完整数据时显示“—”。',
              },
              {
                title: '成交额较前5日均额变化', value: data.fiveDayAmount ? (snapshot.amount / data.fiveDayAmount - 1) * 100 : null, suffix: '%', digits: 2, signed: true, description: '（当日成交额 ÷ 前5个交易日平均成交额 − 1）× 100%。',
              },
            ]}
            />
            {scope === 'all' && (
            <Metrics items={data.markets.map((m) => ({
              title: m.scope === 'hs' ? '沪深A股成交额' : '北交所成交额', value: m.amount, suffix: '亿元', digits: 2,
            }))}
            />
            )}
            <h2 className="section-heading">涨跌概况</h2>
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
              <span style={{ flexGrow: snapshot.flat, background: '#bac1cb' }} />
              <span style={{ flexGrow: snapshot.down, background: 'var(--quote-down)' }} />
            </div>
            )}
            <p className="market-note">涨跌家数包含ST，排除无成交股票。指数展示其自身涨跌，不随统计范围筛选。</p>
            <h2 className="section-heading">历史走势</h2>
            <Card title={`${selected?.name || ''} · 收盘点位`} className="market-chart">
              <CChart genOptions={() => ({
                tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => (v == null ? '—' : `${numberText(v)}点`) },
                grid: {
                  left: 16, right: 16, bottom: 24, top: 20, containLabel: true,
                },
                xAxis: { type: 'category', data: data.series.map((r) => r.date), axisLabel: { hideOverlap: true } },
                yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => numberText(v) } },
                series: [{
                  type: 'line', name: selected?.name, showSymbol: false, connectNulls: false, itemStyle: { color: '#ff2e63' }, data: data.series.map((r) => selected?.series.find((p) => p.date === r.date)?.close ?? null),
                }],
              })}
              />
            </Card>
            <Trend title="市场成交额" unit="亿元" digits={2} data={data} fields={[{ label: '成交额', value: (s) => s.amount }]} />
          </>
        )}
      </DataState>
    </MarketShell>
  );
}
