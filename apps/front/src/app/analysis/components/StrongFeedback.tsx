'use client';

import Link, { InteractionButton } from '@/components/Interaction';
import { StockLink } from '@/components/StockActions';

import { useState } from 'react';
import {
  Card, Col, Row, Space, Tag,
} from 'antd';
import Table from '@/components/DataTable';
import CChart from '@/components/CChart';
import HelpTooltip from '@/components/HelpTooltip';
import { FeedbackBoard, FeedbackGroup, FeedbackMember } from '@/api/market';
import { numberText, changeClass } from '@/utils/format';
import { quoteColors } from '@/colors';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import useMarketData from './useMarketData';
import { DataState, SectionTitle } from './MarketCharts';
import { useMarket } from './MarketContext';
import { marketHref } from './market-navigation';

const boardLabel = (height: number | null) => {
  if (height == null) return '暂无数据';
  return height === 0 ? '未涨停' : `${String(height)}板`;
};

export default function StrongFeedback() {
  const request = useMarketData<FeedbackBoard>('feedback', { days: 20 });
  const [selected, setSelected] = useState('first'); const { date, scope } = useMarket(); const { user } = useAccount();
  const data = request.data?.date === date ? request.data : null;
  const group = data?.groups.find((g) => g.key === selected);
  const pct = (value: number | null) => (
    <span className={changeClass(value)}>
      {numberText(value, 2, true)}
      {value == null ? '' : '%'}
    </span>
  );
  const bins = ['≤-9%', '-9~-5%', '-5~0%', '平盘', '0~5%', '5~9%', '≥9%'];
  return (
    <>
      <SectionTitle title="昨日强势股今日表现" description="点击分组查看明细；涨幅、高开和上涨比例仅统计有效样本。断板指前日连板、昨日未涨停，可与炸板组重叠。" />
      <p className="interaction-hint">选择分组查看涨跌分布与样本。股票菜单提供详情、K线与复制代码，多日轨迹有独立入口。</p>
      <DataState loading={request.loading} error={request.error} retry={request.retry} empty={!data?.ready}>
        <Table<FeedbackGroup>
          rowKey="key"
          bordered
          size="small"
          pagination={false}
          scroll={{ x: 850 }}
          dataSource={data?.groups}
          rowClassName={(g) => (g.key === selected ? 'interaction-selected-row' : '')}
          columns={[
            {
              title: '昨日分组', dataIndex: 'name', width: 160, render: (name, row) => <InteractionButton intent="select" selected={selected === row.key} aria-controls="feedback-details" onClick={() => setSelected(row.key)}>{name}</InteractionButton>,
            },
            {
              title: (
                <span>
                  有效／全部样本
                  <HelpTooltip label="纳入样本" title="参与分组统计的有效股票数／该分组全部股票数；排除原因见下方明细。" />
                </span>
              ),
              align: 'right',
              width: 135,
              render: (_, g) => (g.ready ? `${g.sample}／${g.total}` : '待更新'),
            },
            {
              title: '今日平均涨幅', dataIndex: 'average', align: 'right', render: (v, g) => pct(g.ready ? v : null),
            },
            {
              title: '今日涨幅中位数', dataIndex: 'median', align: 'right', render: (v, g) => pct(g.ready ? v : null),
            },
            {
              title: '今日上涨比例', dataIndex: 'riseRate', align: 'right', render: (v, g) => `${numberText(g.ready ? v : null)}${g.ready && v != null ? '%' : ''}`,
            },
            {
              title: '今日高开比例', dataIndex: 'highOpenRate', align: 'right', render: (v, g) => `${numberText(g.ready ? v : null)}${g.ready && v != null ? '%' : ''}`,
            },
          ]}
        />
        <Row id="feedback-details" gutter={[16, 16]} className="feedback-details">
          <Col xs={24} lg={8}>
            <Card title={`${group?.name || '昨日首板'} - 今日涨跌分布`}>
              <CChart
                height={330}
                genOptions={() => ({
                  tooltip: { trigger: 'axis', valueFormatter: (v:unknown) => `${numberText(v, 0)}只` },
                  grid: {
                    top: 35, left: 12, right: 12, bottom: 12, containLabel: true,
                  },
                  xAxis: {
                    type: 'category', data: bins, axisTick: { alignWithLabel: true }, axisLabel: { interval: 0, rotate: 25, fontSize: 11 },
                  },
                  yAxis: { type: 'value', name: '只', minInterval: 1 },
                  series: [{ type: 'bar', barMaxWidth: 42, data: (group?.ready ? group.distribution : []).map((value, i) => ({ value, itemStyle: { color: [quoteColors.down, quoteColors.flat, quoteColors.up][Math.sign(i - 3) + 1] } })) }],
                })}
              />
            </Card>
          </Col>
          <Col xs={24} lg={16}>
            <Card
              title={`${group?.name || '昨日首板'} - 样本明细`}
              extra={(
                <span className="market-note">
                  不参与分组统计
                  {group?.ready ? group.excluded : '—'}
                  {' '}
                  只
                </span>
)}
            >
              <Table<FeedbackMember>
                rowKey="tsCode"
                size="small"
                pagination={false}
                maxBodyHeight={300}
                minBodyHeight={280}
                scroll={{ x: 600 }}
                dataSource={group?.ready ? group.members : []}
                locale={{ emptyText: group?.ready ? '无样本' : '待更新' }}
                columns={[
                  {
                    title: '股票',
                    width: 160,
                    render: (_, r) => (
                      <Space direction="vertical" size={0}>
                        <StockLink code={r.tsCode} name={r.name} date={date} />
                        {allowedPath(user, '/analysis/chains') && <Link href={marketHref('/analysis/chains', { date, scope }, { code: r.tsCode, view: 'trajectory' })}>多日轨迹</Link>}
                        <span className="market-note">{r.tsCode}</span>
                      </Space>
                    ),
                  },
                  {
                    title: '今日涨跌幅', dataIndex: 'pctChg', align: 'right', render: pct,
                  },
                  {
                    title: '昨日 → 今日连板', align: 'center', render: (_, r) => [r.previousHeight, r.height].map(boardLabel).join(' → '),
                  },
                  {
                    title: (
                      <span>
                        是否参与分组统计
                        <HelpTooltip label="分组统计" title="参与：计入分组的平均涨幅、中位数、上涨比例和高开比例。不参与：保留在样本明细中，并注明排除原因。" />
                      </span>
                    ),
                    dataIndex: 'excluded',
                    render: (v) => (v ? (
                      <span>
                        <Tag>不参与</Tag>
                        {v}
                      </span>
                    ) : '参与'),
                  },
                ]}
              />
              <p className="market-note">统计范围：首板、连板组排除昨日一字板；各组排除ST、新股、退市整理及无效行情。排除的样本保留在明细中供核对。</p>
            </Card>
          </Col>
        </Row>
      </DataState>
    </>
  );
}
