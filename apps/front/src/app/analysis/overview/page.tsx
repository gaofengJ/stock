'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Col, Row } from 'antd';
import { MarketSeries } from '@/api/market';
import { changeClass, numberText } from '@/utils/format';
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
  const { scope } = useMarket();
  const [index, setIndex] = useState<string | null>(null);
  const [window, setWindow] = useState<ChartWindow>({ period: 'day', count: 60 });
  useEffect(() => { setIndex(null); }, [scope]);
  const snapshot = data?.snapshot;
  const indexDates = useMemo(() => data?.series.map((r) => r.date) || [], [data]);
  const indexes = scopeIndexes(data?.indexes || [], scope);
  const selected = indexes.find((i) => i.code === index);
  const visibleIndexes = selected ? [selected] : indexes;
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
            <SectionTitle title="主要指数" description="点击指数可单独查看，再次点击恢复全部。指数行情取其自身样本；主板范围的上证指数、深证成指也包含其他板块样本。" />
            <Row gutter={[16, 16]} className="market-metrics">
              {indexes.map((i) => {
                const point = i.series.find((r) => r.date === data.date);
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
                        <span className={changeClass(point?.pctChg)}>{`${numberText(point?.pctChg, 2, true)}${point ? '%' : ''}`}</span>
                      </span>
                    </button>
                  </Col>
                );
              })}
            </Row>
            <div className="market-section-toolbar">
              <div className="market-chart-selection">
                <SectionTitle title="行情图表" description="周期与日期范围同时作用于下方全部K线、成交量和市场成交额。周/月数据由日线汇总，首尾周期可能不完整；指数成交量使用其自身样本，不能相加作为全市场成交量。" />
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
              <Col xs={24} lg={12}>
                <MarketAmountChart title={`${range} - 市场成交额`} data={data} dates={indexDates} window={window} />
              </Col>
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
            <SectionTitle title="涨跌概况" description="按所选统计范围计算，包含ST，排除当日无成交股票。" />
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
          </>
        )}
      </DataState>
    </MarketShell>
  );
}
