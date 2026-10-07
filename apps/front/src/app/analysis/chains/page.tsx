'use client';

import {
  Button, Card, Col, DatePicker, Empty, Row, Tabs, Tag,
} from 'antd';
import Table from '@/components/DataTable';
import { changeClass } from '@/utils/format';
import { Ladder, LimitRow, MarketSeries } from '@/api/market';
import Link, { InteractionButton } from '@/components/Interaction';
import { StockLink } from '@/components/StockActions';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import SectorFilter from '@/components/SectorFilter';
import StrongTrajectories from '../components/StrongTrajectories';
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
import { chainView } from './chains-display';
import './chains.css';

function LadderGroups({ items }: { items: LimitRow[] }) {
  const { date } = useMarket();
  const [expanded, setExpanded] = useState<number[]>([]);
  const heights = Array.from(new Set(items.map((r) => r.limitTimes))).sort((a, b) => b - a);
  return (
    <div className="chains-ladder">
      {heights.map((height) => {
        const stocks = items.filter((r) => r.limitTimes === height);
        const open = expanded.includes(height);
        const visible = open ? stocks : stocks.slice(0, height === 1 ? 0 : 8);
        return (
          <section className="chains-ladder-row" key={height}>
            <div className="chains-ladder-label">
              <strong>{height === 1 ? '首板' : `${height}连板`}</strong>
              <span>
                {stocks.length}
                {' '}
                只
              </span>
            </div>
            <div className="chains-ladder-content">
              <div className="market-ladder-stocks" id={`ladder-height-${height}`}>
                {visible.map((r) => (
                  <span key={r.tsCode} className="market-ladder-stock">
                    <StockLink code={r.tsCode} name={r.name} date={date} />
                    <span>{r.tsCode}</span>
                  </span>
                ))}
              </div>
              {(height === 1 || stocks.length > 8) && (
                <InteractionButton intent="expand" expanded={open} aria-controls={`ladder-height-${height}`} onClick={() => setExpanded((old) => (open ? old.filter((n) => n !== height) : [...old, height]))}>
                  {open ? '收起名单' : `展开${height === 1 ? '首板' : '全部'}名单（${stocks.length}只）`}
                </InteractionButton>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ChainsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = chainView(params.get('view'));
  const sector = params.get('sector') || undefined;
  const { date, scope, status } = useMarket();
  const [detailDate, setDetailDate] = useState<string>();
  const navigate = (view: string, changes: Record<string, string | undefined> = {}) => {
    const query = new URLSearchParams(params.toString());
    Object.entries({
      date, scope, view, ...changes,
    }).forEach(([key, value]) => {
      if (value) query.set(key, value); else query.delete(key);
    });
    router.push(`/analysis/chains/?${query}`, { scroll: false });
  };
  const setSector = (value?: string) => navigate('ladder', { sector: value });
  const setTrajectorySector = (value?: string) => navigate('trajectory', { trajectorySector: value });
  const openLadder = (day: string) => navigate('ladder', { date: day, sector: undefined, code: undefined });
  const series = useMarketData<MarketSeries>('chains', { days: 730 }, tab !== 'trajectory');
  const ladder = useMarketData<Ladder>('ladder', { sector }, tab === 'ladder');
  return (
    <MarketShell title="连板分析" path="/analysis/chains">
      <Tabs
        activeKey={tab}
        onChange={(view) => navigate(view)}
        items={[
          {
            key: 'ladder',
            label: '当日梯队',
            children: (
              <>
                <SectionTitle title="市场晋级概况" description="按顶部统计范围内的数据源非ST样本计算。晋级率跟踪昨日同一批股票，停牌视为未晋级；高位指昨日四板及以上。不受下方行业／概念筛选影响。" />
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
                            {r.numerator}
                            {' '}
                            只／昨日样本
                            {r.denominator}
                            {' '}
                            只
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </DataState>
                <SectionTitle title="股票梯队与去向" />
                <div className="chains-filter">
                  <SectorFilter value={sector} onChange={setSector} />
                  <span className="chains-filter-note">仅筛选当日股票梯队与昨日连板股去向</span>
                </div>
                <DataState loading={ladder.loading} error={ladder.error} retry={ladder.retry} empty={!ladder.data?.ready}>
                  {!ladder.data?.items.length ? <Empty description={sector ? '当前筛选范围内无涨停股票' : '当前统计范围内当日无涨停股票'} /> : <LadderGroups key={`${date}:${scope}:${sector}`} items={ladder.data.items} />}
                  <Card title={<SectionTitle title="昨日连板股去向" description="跟踪昨日二板及以上股票。今日高度为0表示有成交但未涨停；无行情或无成交时不计算高度和涨跌幅。" />}>
                    <Table<Ladder['transitions'][number]>
                      rowKey="tsCode"
                      size="small"
                      dataSource={ladder.data?.transitions}
                      scroll={{ x: 720 }}
                      pagination={false}
                      minBodyHeight={120}
                      maxBodyHeight={400}
                      locale={{ emptyText: '当前范围内无昨日连板股票' }}
                      columns={[
                        {
                          title: '股票',
                          width: 170,
                          render: (_, r) => (
                            <div className="chains-stock-link">
                              <StockLink code={r.tsCode} name={r.name} date={date} />
                              <span className="chains-stock-code">{r.tsCode}</span>
                              <Link href={marketHref('/analysis/chains', { date, scope }, { view: 'trajectory', code: r.tsCode })}>多日轨迹</Link>
                            </div>
                          ),
                        },
                        {
                          title: '昨日连板', dataIndex: 'previousHeight', width: 120, align: 'right', sorter: (a, b) => a.previousHeight - b.previousHeight, render: (v) => `${v}板`,
                        },
                        {
                          title: '今日连板', dataIndex: 'height', width: 120, align: 'right', render: (v) => { if (v == null) return '—'; return v === 0 ? '未涨停' : `${v}板`; },
                        },
                        {
                          title: '今日涨跌幅',
                          dataIndex: 'pctChg',
                          width: 140,
                          align: 'right',
                          render: (v) => (
                            <span className={changeClass(v)}>
                              {numberText(v, 2, true)}
                              {v == null ? '' : '%'}
                            </span>
                          ),
                        },
                        {
                          title: '结果', dataIndex: 'state', width: 140, filters: ['晋级', '断板', '无行情', '无成交'].map((text) => ({ text, value: text })), onFilter: (value, row) => row.state === value, render: (v) => <Tag className={v === '晋级' ? 'quote-up-tag' : undefined}>{v}</Tag>,
                        },
                      ]}
                    />
                  </Card>
                </DataState>
              </>
            ),
          },
          { key: 'trajectory', label: '多日轨迹', children: <StrongTrajectories key={`${date}:${scope}`} sector={params.get('trajectorySector') || undefined} onSectorChange={setTrajectorySector} active={tab === 'trajectory'} /> },
          {
            key: 'history',
            label: '历史统计',
            children: (
              <>
                <div className="market-section-toolbar">
                  <SectionTitle title="市场历史走势" description="按顶部统计范围计算，不受股票行业／概念筛选影响。" />
                  <TrendRange />
                </div>
                <div className="chains-history-toolbar mb-16">
                  <span className="market-note">点击图表数据或日期查看当日梯队，或选择日期：</span>
                  <DatePicker aria-label="梯队明细日期" allowClear={false} value={dayjs(detailDate || date)} onChange={(value) => { if (value) setDetailDate(value.format('YYYY-MM-DD')); }} disabledDate={(value) => !(status?.dates || []).includes(value.format('YYYY-MM-DD'))} />
                  <Button size="small" onClick={() => openLadder(detailDate || date)}>查看当日梯队</Button>
                </div>
                <DataState loading={series.loading} error={series.error} retry={series.retry} empty={!series.data?.series.some((r) => r.data)}>
                  {series.data && (
                    <Row gutter={20}>
                      <Col xs={24} lg={12}><Trend onDateClick={openLadder} title="最高连板" unit="板" data={series.data} average fields={[{ label: '连板高度', value: (s) => s.maxHeight }]} /></Col>
                      <Col xs={24} lg={12}><Trend onDateClick={openLadder} title="涨停梯队数量（含首板）" unit="只" data={series.data} average fields={[1, 2, 3, 4].map((n) => ({ label: n === 4 ? '四板及以上' : `${n}板`, value: (s) => s.counts[n - 1] }))} /></Col>
                      <Col xs={24} lg={12}><Trend onDateClick={openLadder} title="连板晋级率" description="昨日对应梯队无样本时不计算晋级率，曲线保留断点；有样本但无人晋级为0%。悬浮可查看样本数和晋级数量。" data={series.data} percent average fields={[1, 2, 3, 4].map((n) => ({ label: n === 4 ? '高位晋级' : `${n}进${n + 1}`, value: (s) => s.upgrades[n - 1].rate, tooltip: (s) => promotionTooltip(s, n) }))} /></Col>
                      <Col xs={24} lg={12}><Trend onDateClick={openLadder} title="首板与连板成交额" description="首板为当日连板高度为1的股票，连板为连续两板及以上股票，两组不重叠。统计股票当日全部成交额，单位亿元。" unit="亿元" digits={2} type="bar" data={series.data} fields={[{ label: '首板成交额', value: (s) => s.limitAmount - s.chainAmount }, { label: '连板成交额', value: (s) => s.chainAmount }]} /></Col>
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
