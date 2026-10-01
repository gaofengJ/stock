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

export default function IndexComparisonChart({ indexes, dates }: { indexes: MarketSeries['indexes']; dates: string[] }) {
  const [days, setDays] = useState(60);
  const [group, setGroup] = useState('size');
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
          <HelpTooltip label="指数相对表现" title="同一起始日设为0%，比较区间涨跌幅；参考指数成分可能跨板块、相互重叠。" />
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
        {hasSizes && group === 'size' ? '沪深300 / 中证500 / 中证1000，对照大、中、小盘表现' : '所选市场范围的参考指数'}
        {comparison.baseline && <span>{`基准 ${comparison.baseline} → ${comparison.end}`}</span>}
      </div>
      <Row gutter={[24, 16]} align="middle">
        <Col xs={24} xl={14}>
          {!valid.length ? <div className="market-environment-empty"><Empty description="缺少共同基准日数据" /></div> : (
            <CChart genOptions={() => ({
              tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => `${numberText(value, 2, true)}%` },
              legend: { top: 0, type: 'scroll' },
              grid: {
                left: 16, right: 24, top: 56, bottom: 24, containLabel: true,
              },
              xAxis: {
                type: 'category', data: comparison.dates, boundaryGap: false, axisPointer: { snap: true }, axisLabel: { hideOverlap: true }, axisTick: { alignWithLabel: true },
              },
              yAxis: { type: 'value', name: '%', axisLabel: { formatter: '{value}%' } },
              series: valid.map((i, position) => ({
                name: i.name,
                type: 'line',
                data: i.values,
                connectNulls: false,
                showSymbol: false,
                itemStyle: { color: chartPalette[position] },
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
