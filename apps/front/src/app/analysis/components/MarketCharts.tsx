'use client';

import {
  Alert, Button, Card, Col, Empty, Row, Select,
} from 'antd';
import { memo } from 'react';
import { LoadingOverlay } from '@/components/Loading';
import CChart from '@/components/CChart';
import { useSiteTheme } from '@/components/SiteTheme';
import HelpTooltip from '@/components/HelpTooltip';
import {
  quoteColors, chartColors, chartPalette,
} from '@/colors';
import { numberText, changeClass } from '@/utils/format';
import { MarketSeries, MarketStats } from '@/api/market';
import { useMarket } from './MarketContext';
import { amountReferenceLevels } from './market-display';

export { numberText } from '@/utils/format';
export function TrendRange() {
  const { days, select } = useMarket();
  return (
    <div className="market-trend-control">
      <span>趋势范围</span>
      <Select aria-label="趋势范围" value={days} onChange={(value) => select({ days: value })} options={[20, 60, 120, 250, 730].map((value) => ({ value, label: value === 730 ? '最近两年' : `近${value}个交易日` }))} />
    </div>
  );
}
export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <h2 className="section-heading market-section-title">
      {title}
      {description && <HelpTooltip label={title} title={description} />}
    </h2>
  );
}
export function DataState({
  loading, error, empty, children, retry,
}: {
  loading: boolean; error: string; empty: boolean; children: React.ReactNode; retry?: () => void;
}) {
  return (
    <div className="market-data-state" aria-busy={loading}>
      {error && <Alert type="error" message={error} description={!empty ? '更新失败，以下为上次成功加载的数据。' : undefined} showIcon action={retry && <Button size="small" onClick={retry}>重试</Button>} />}
      {loading && empty && <div className="market-initial-loading"><LoadingOverlay /></div>}
      {!loading && !error && empty && <div className="market-empty"><Empty description="暂无数据" /></div>}
      {!empty && <div className={`market-data-content${loading || error ? ' is-pending' : ''}`} aria-hidden={loading || !!error}>{children}</div>}
      {loading && !empty && <LoadingOverlay />}
    </div>
  );
}
interface Metric {
  title: string; value: number | null | undefined; suffix?: string; digits?: number;
  signed?: boolean; className?: string; description?: string; display?: string; note?: string;
}
export function Metrics({ items }: { items: Metric[] }) {
  return (
    <Row gutter={[16, 16]} className="market-metrics">
      {items.map((i) => (
        <Col key={i.title} xs={24} sm={12} xl={6}>
          <Card size="small" className="metric-card">
            <div className="metric-label">
              {i.title}
              {i.description && <HelpTooltip title={i.description} label={i.title} />}
            </div>
            <div className={`metric-value ${i.className || (i.signed ? changeClass(i.value) : '')}`}>
              {i.display ?? numberText(i.value, i.digits ?? 0, i.signed)}
              {i.value != null && i.suffix && <span className="metric-unit">{i.suffix}</span>}
            </div>
            {i.note && <div className="metric-note">{i.note}</div>}
          </Card>
        </Col>
      ))}
    </Row>
  );
}
const seriesColor = (label: string, index: number) => {
  if (/炸板/.test(label)) return quoteColors.warning;
  if (/高开/.test(label)) return chartColors.blue;
  if (/跌|下跌/.test(label)) return quoteColors.down;
  if (/涨停|上涨/.test(label)) return quoteColors.up;
  return chartPalette[index % chartPalette.length];
};
function TrendChart({
  title, data, fields, percent = false, unit = '', digits = 0, type = 'line', controls = false,
}: {
  title: string; data: MarketSeries; fields: { label: string; value: (s: MarketStats) => number | null }[];
  percent?: boolean; unit?: string; digits?: number; type?: 'line' | 'bar'; controls?: boolean;
}) {
  const { colors } = useSiteTheme();
  const suffix = percent ? '%' : unit;
  const { days } = useMarket();
  const series = days === 730 ? data.series : data.series.slice(-days);
  const references = unit === '亿元' ? amountReferenceLevels(series.flatMap((r) => fields.map((f) => (r.data ? f.value(r.data) : null)))) : [];
  return (
    <Card title={title} extra={controls && <TrendRange />} className="market-chart">
      <CChart genOptions={() => ({
        tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => (v == null ? '—' : `${numberText(v, percent ? 2 : digits)}${suffix}`) },
        legend: { top: 0, left: 'center', type: 'scroll' },
        grid: {
          left: 16, right: 20, top: 56, bottom: 24, containLabel: true,
        },
        xAxis: { type: 'category', data: series.map((r) => r.date), axisLabel: { hideOverlap: true } },
        yAxis: {
          type: 'value', name: suffix, nameGap: 16, max: references.at(-1), minInterval: percent || digits ? undefined : 1, axisLabel: { formatter: (v: number) => numberText(v, percent ? 2 : digits) },
        },
        series: fields.map((f, index) => ({
          type,
          barMaxWidth: 24,
          name: f.label,
          itemStyle: { color: seriesColor(f.label, index) },
          showSymbol: series.length <= 30,
          connectNulls: false,
          data: series.map((r) => (r.data ? f.value(r.data) : null)),
          markLine: index === 0 ? {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: chartColors.reference, width: 1 },
            label: { position: 'insideEndTop', formatter: '{b}', color: colors.secondary },
            data: references.map((value) => ({ name: `${value / 10000}万亿`, yAxis: value })),
          } : undefined,
        })),
      })}
      />
    </Card>
  );
}
export const Trend = memo(TrendChart);
