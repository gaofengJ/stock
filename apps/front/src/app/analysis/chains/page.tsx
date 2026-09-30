'use client';

import {
  Card, Col, Row, Tabs, Tag,
} from 'antd';
import Table from '@/components/DataTable';
import { changeClass } from '@/utils/format';
import { Ladder, MarketSeries } from '@/api/market';
import Link from 'next/link';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { useMarket } from '../components/MarketContext';
import { marketHref } from '../components/market-navigation';
import { promotionTooltip } from '../components/promotion-display';
import MarketCompatibility from '../components/MarketCompatibility';
import LegacyPage from './LegacyPage';

import MarketShell from '../components/MarketShell';
import useMarketData from '../components/useMarketData';
import {
  DataState, numberText, Trend, TrendRange, SectionTitle,
} from '../components/MarketCharts';

function ChainsPage() {
  const { date, scope } = useMarket();
  const { user } = useAccount();
  const series = useMarketData<MarketSeries>('chains', { days: 730 });
  const ladder = useMarketData<Ladder>('ladder');
  const heights = Array.from(new Set(ladder.data?.items.map((r) => r.limitTimes) || [])).sort((a, b) => b - a);
  return (
    <MarketShell title="连板分析" path="/analysis/chains">
      <SectionTitle title="连板统计" description="按数据源非ST样本统计。晋级率按昨日同一批股票跟踪；分母为昨日对应高度全部股票，停牌视为未晋级。高位指昨日四板及以上。" />
      <Tabs items={[
        {
          key: 'ladder',
          label: '当日梯队',
          children: (
            <>
              <DataState loading={series.loading} error={series.error} retry={series.retry} empty={!series.data?.snapshot}>
                <Row gutter={[16, 16]} className="market-metrics">
                  {series.data?.snapshot?.upgrades.map((r) => (
                    <Col xs={24} sm={12} xl={6} key={r.from}>
                      <Card size="small" title={r.from === 4 ? '高位晋级' : `${r.from}进${r.from + 1}`}>
                        <strong className="metric-value">
                          {numberText(r.rate)}
                          {r.rate == null ? '' : '%'}
                        </strong>
                        <div>
                          晋级
                          {' '}
                          {r.numerator}
                          {' '}
                          只／昨日样本
                          {' '}
                          {r.denominator}
                          {' '}
                          只
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </DataState>
              <DataState loading={ladder.loading} error={ladder.error} retry={ladder.retry} empty={!ladder.data?.ready}>
                {!heights.length && <p>当日无涨停记录</p>}
                {heights.map((height) => (
                  <Card key={height} className="market-chart" title={`${height === 1 ? '首板' : `${height}连板`} - ${ladder.data!.items.filter((r) => r.limitTimes === height).length}只`}>
                    <div className="market-ladder-stocks">
                      {ladder.data!.items.filter((r) => r.limitTimes === height).map((r) => (
                        allowedPath(user, '/analysis/limits')
                          ? (
                            <Link key={r.tsCode} className="market-ladder-stock" href={marketHref('/analysis/limits', { date, scope }, { keyword: r.tsCode })} title={`查看${r.name}涨停明细`}>
                              {r.name}
                              <span>{r.tsCode}</span>
                            </Link>
                          )
                          : (
                            <span key={r.tsCode} className="market-ladder-stock">
                              {r.name}
                              <span>{r.tsCode}</span>
                            </span>
                          )
                      ))}
                    </div>
                  </Card>
                ))}
                <Card title="昨日连板股去向">
                  <Table
                    rowKey="tsCode"
                    size="small"
                    dataSource={ladder.data?.transitions}
                    scroll={{ x: 760 }}
                    pagination={false}
                    minBodyHeight={400}
                    maxBodyHeight={400}
                    columns={[
                      { title: '代码', dataIndex: 'tsCode' }, { title: '名称', dataIndex: 'name' }, { title: '昨日高度', dataIndex: 'previousHeight' },
                      { title: '今日高度', dataIndex: 'height' }, {
                        title: '今日涨跌幅(%)', dataIndex: 'pctChg', align: 'right', render: (v) => <span className={changeClass(v)}>{numberText(v, 2, true)}</span>,
                      },
                      { title: '结果', dataIndex: 'state', render: (v) => <Tag className={v === '晋级' ? 'quote-up-tag' : undefined}>{v}</Tag> },
                    ]}
                  />
                </Card>
              </DataState>
            </>
          ),
        },
        {
          key: 'history',
          label: '历史统计',
          children: (
            <>
              <div className="market-section-toolbar">
                <SectionTitle title="历史走势" />
                <TrendRange />
              </div>
              <DataState loading={series.loading} error={series.error} retry={series.retry} empty={!series.data?.snapshot}>
                {series.data && (
                <Row gutter={20}>
                  <Col xs={24} lg={12}><Trend title="最高连板" unit="板" data={series.data} average fields={[{ label: '连板高度', value: (s) => s.maxHeight }]} /></Col>
                  <Col xs={24} lg={12}><Trend title="涨停梯队数量（含首板）" unit="只" data={series.data} average fields={[1, 2, 3, 4].map((n) => ({ label: n === 4 ? '四板及以上' : `${n}板`, value: (s) => s.counts[n - 1] }))} /></Col>
                  <Col xs={24} lg={12}><Trend title="连板晋级率" description="昨日对应梯队无样本时不计算晋级率，曲线保留断点；有样本但无人晋级为0%。悬浮可查看样本数和晋级数量。" data={series.data} percent average fields={[1, 2, 3, 4].map((n) => ({ label: n === 4 ? '高位晋级' : `${n}进${n + 1}`, value: (s) => s.upgrades[n - 1].rate, tooltip: (s) => promotionTooltip(s, n) }))} /></Col>
                  <Col xs={24} lg={12}><Trend title="涨停与连板成交额" unit="亿元" digits={2} type="bar" data={series.data} fields={[{ label: '涨停成交额', value: (s) => s.limitAmount }, { label: '连板成交额', value: (s) => s.chainAmount }]} /></Col>
                </Row>
                )}
              </DataState>
            </>
          ),
        },
      ]}
      />
    </MarketShell>
  );
}

export default function Page() {
  return <MarketCompatibility legacy={<LegacyPage />}><ChainsPage /></MarketCompatibility>;
}
