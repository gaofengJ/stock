'use client';

import { useState } from 'react';
import {
  Card, Col, Empty, Row, Segmented, Select, Table,
} from 'antd';
import type { MarketSeries } from '@/api/market';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { chartPalette, chartColors, withAlpha } from '@/colors';
import { numberText, changeClass } from '@/utils/format';
import { environmentRanges, indexComparison } from './market-environment';
import { overviewDateAxis, overviewGrid } from './overview-chart';

export default function IndexComparisonChart({ indexes, dates }: { indexes: MarketSeries['indexes']; dates: string[] }) {
  const [days, setDays] = useState(60);
  const [group, setGroup] = useState('all');
  const sizeCodes = ['000300.SH', '000905.SH', '000852.SH'];
  const hasSizes = sizeCodes.every((code) => indexes.some((i) => i.code === code));
  const selected = hasSizes && group === 'size' ? indexes.filter((i) => sizeCodes.includes(i.code)) : indexes;
  const comparison = indexComparison(selected, dates, days);
  const valid = comparison.indexes.filter((i) => i.values.some((v) => v != null));
  return (
    <Card
      className="market-chart market-comparison"
      title={(
        <span className="market-section-title">
          指数相对表现
          <HelpTooltip label="指数相对表现" title="以所选区间前一交易日收盘价为基准，比较累计涨跌幅；沪深300、中证500、中证1000用于对照由大到小的市值层级，并非严格的大中小盘分类，不包含全部小微盘股票。" />
        </span>
)}
      extra={(
        <div className="market-chart-controls">
          {hasSizes && <Segmented aria-label="指数比较组" value={group} onChange={(value) => setGroup(String(value))} options={[{ value: 'size', label: '大小盘' }, { value: 'all', label: '全部指数' }]} />}
          <Select aria-label="指数比较日期范围" value={days} onChange={setDays} options={environmentRanges} />
        </div>
      )}
    >
      <div className="market-environment-caption">
        {hasSizes && group === 'size' ? '沪深300 / 中证500 / 中证1000，对照不同市值层级表现' : '所选市场范围的参考指数'}
        {comparison.baseline && <span>{`区间 ${comparison.dates[0]} → ${comparison.end} · 基准收盘 ${comparison.baseline}`}</span>}
      </div>
      <Row gutter={[24, 16]} align="middle">
        <Col xs={24} xl={14}>
          {!valid.length ? <div className="market-environment-empty"><Empty description="缺少共同基准日数据" /></div> : (
            <CChart
              key={selected.map((i) => i.code).join(',')}
              genOptions={() => ({
                tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => `${numberText(value, 2, true)}%` },
                legend: { top: 0, type: 'scroll' },
                grid: overviewGrid,
                xAxis: overviewDateAxis(comparison.dates),
                yAxis: { type: 'value', name: '%', axisLabel: { formatter: '{value}%' } },
                series: valid.map((i, position) => ({
                  id: i.code,
                  name: i.name,
                  type: 'line',
                  data: i.values,
                  connectNulls: false,
                  showSymbol: false,
                  itemStyle: { color: chartPalette[indexes.findIndex((item) => item.code === i.code) % chartPalette.length] },
                  lineStyle: { width: 1.5 },
                  markLine: position === 0 ? {
                    silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: withAlpha(chartColors.reference, 0.4), type: 'dashed' }, data: [{ yAxis: 0 }],
                  } : undefined,
                })),
              })}
            />
          )}
        </Col>
        <Col xs={24} xl={10}>
          <Table
            className="market-comparison-table"
            size="small"
            rowKey="code"
            pagination={false}
            dataSource={comparison.indexes}
            scroll={{ x: 400 }}
            columns={[
              { title: '指数', dataIndex: 'name' },
              {
                title: '所选区间', dataIndex: 'change', align: 'right', render: (value) => <span className={changeClass(value)}>{value == null ? '—' : `${numberText(value, 2, true)}%`}</span>,
              },
              ...[5, 20, 60].map((count, position) => ({
                title: `${count}日`, key: count, align: 'right' as const, render: (_: unknown, row: typeof comparison.indexes[number]) => <span className={changeClass(row.returns[position])}>{row.returns[position] == null ? '—' : `${numberText(row.returns[position], 2, true)}%`}</span>,
              })),
            ]}
          />
          <div className="market-environment-caption">各列截至所选交易日；缺少起止日数据时显示 —。</div>
        </Col>
      </Row>
    </Card>
  );
}
