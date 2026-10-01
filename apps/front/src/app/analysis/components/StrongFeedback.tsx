'use client';

import { useState } from 'react';
import {
  Button, Card, Col, Row, Space, Tag,
} from 'antd';
import Link from 'next/link';
import Table from '@/components/DataTable';
import CChart from '@/components/CChart';
import { FeedbackBoard, FeedbackGroup, FeedbackMember } from '@/api/market';
import { numberText, changeClass } from '@/utils/format';
import { quoteColors } from '@/colors';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import useMarketData from './useMarketData';
import { DataState, SectionTitle } from './MarketCharts';
import { useMarket } from './MarketContext';
import { marketHref } from './market-navigation';

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
      <SectionTitle title="强势股收益与负反馈" description="跟踪昨日四组股票今日表现，非交易收益率。断板指前日连板、昨日未涨停；断板与炸板可重叠。" />
      <DataState loading={request.loading} error={request.error} retry={request.retry} empty={!data?.ready}>
        <Table<FeedbackGroup>
          rowKey="key"
          bordered
          size="small"
          pagination={false}
          scroll={{ x: 850 }}
          dataSource={data?.groups}
          rowClassName={(g) => (g.key === selected ? 'feedback-selected' : '')}
          columns={[
            {
              title: '昨日分组', dataIndex: 'name', width: 160, render: (name, row) => <Button type="link" onClick={() => setSelected(row.key)}>{name}</Button>,
            },
            {
              title: '有效／总样本', align: 'right', width: 135, render: (_, g) => (g.ready ? `${g.sample}／${g.total}` : '待更新'),
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
        <Row gutter={[16, 16]} className="feedback-details">
          <Col xs={24} lg={12}>
            <Card title={`${group?.name || '昨日首板'} - 今日涨跌分布`}>
              <CChart
                height={330}
                genOptions={() => ({
                  tooltip: { trigger: 'axis', valueFormatter: (v:unknown) => `${numberText(v, 0)}只` },
                  grid: {
                    top: 45, left: 50, right: 20, bottom: 45,
                  },
                  xAxis: { type: 'category', data: bins, axisTick: { alignWithLabel: true } },
                  yAxis: { type: 'value', name: '只', minInterval: 1 },
                  series: [{ type: 'bar', barMaxWidth: 42, data: (group?.ready ? group.distribution : []).map((value, i) => ({ value, itemStyle: { color: [quoteColors.down, quoteColors.flat, quoteColors.up][Math.sign(i - 3) + 1] } })) }],
                })}
              />
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card
              title={`${group?.name || '昨日首板'} - 样本明细`}
              extra={(
                <span className="market-note">
                  剔除
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
                scroll={{ x: 660 }}
                dataSource={group?.ready ? group.members : []}
                locale={{ emptyText: group?.ready ? '无样本' : '待更新' }}
                columns={[
                  {
                    title: '股票',
                    width: 160,
                    render: (_, r) => (
                      <Space direction="vertical" size={0}>
                        {allowedPath(user, '/analysis/chains') ? <Link href={marketHref('/analysis/chains', { date, scope }, { code: r.tsCode, view: 'trajectory' })}>{r.name}</Link> : r.name}
                        <span className="market-note">{r.tsCode}</span>
                      </Space>
                    ),
                  },
                  {
                    title: '今日涨跌幅', dataIndex: 'pctChg', align: 'right', render: pct,
                  },
                  { title: '昨日／今日高度', align: 'center', render: (_, r) => `${r.previousHeight ?? '—'}／${r.height ?? '—'}` },
                  { title: '统计状态', dataIndex: 'excluded', render: (v) => (v ? <Tag>{v}</Tag> : '计入') },
                ]}
              />
              <p className="market-note">首板、连板剔除昨日一字板；各组剔除ST、新股、退市整理及无效行情。</p>
            </Card>
          </Col>
        </Row>
      </DataState>
    </>
  );
}
