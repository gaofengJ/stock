'use client';

import {
  Alert, Card, Col, Empty, Row, Spin, Statistic,
} from 'antd';
import CChart from '@/components/CChart';
import { EThemeColors } from '@/types/common.enum';
import { MarketSeries, MarketStats } from '@/api/market';

export const numberText = (value: unknown, digits = 2) => (value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits }));
export function DataState({
  loading, error, empty, children,
}: { loading: boolean; error: string; empty: boolean; children: React.ReactNode }) {
  if (loading) return <Spin className="market-loading" />;
  if (error) return <Alert type="error" message={error} showIcon />;
  if (empty) return <Empty description="该日期数据尚未完整，请查看同步状态" />;
  return <div>{children}</div>;
}
export function Metrics({ items }: { items: { title: string; value: number | null | undefined; suffix?: string; digits?: number }[] }) {
  return <Row gutter={[16, 16]} className="market-metrics">{items.map((i) => <Col key={i.title} span={6}><Card size="small"><Statistic title={i.title} value={i.value ?? '—'} precision={i.value == null ? undefined : i.digits ?? 0} suffix={i.value == null ? undefined : i.suffix} /></Card></Col>)}</Row>;
}
export function Trend({
  title, data, fields, percent = false,
}: { title: string; data: MarketSeries; fields: { label: string; value: (s: MarketStats) => number | null }[]; percent?: boolean }) {
  return (
    <Card title={title} className="market-chart">
      <CChart genOptions={() => ({
        color: [EThemeColors.colorPinkRed78, '#52a884', '#638dd9', '#dba155'],
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: {
          left: 55, right: 25, top: 20, bottom: 70,
        },
        xAxis: { type: 'category', data: data.series.map((r) => r.date), axisLabel: { formatter: (v: string) => v.slice(5) } },
        yAxis: { type: 'value', ...(percent ? { axisLabel: { formatter: '{value}%' } } : {}) },
        series: fields.map((f) => ({
          type: 'line', name: f.label, showSymbol: data.series.length <= 30, connectNulls: false, data: data.series.map((r) => (r.data ? f.value(r.data) : null)),
        })),
      })}
      />
    </Card>
  );
}
