'use client';

import {
  Alert, DatePicker, Empty, Select, Space, Spin, Tag, Typography,
} from 'antd';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import CSearchForm from '@/components/common/CSearchForm';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import { useMarket } from './MarketContext';
import './market.sass';

export const scopes = [
  { value: 'all', label: '沪深京全部' }, { value: 'hs', label: '沪深' },
  { value: 'main', label: '主板' }, { value: 'gem', label: '创业板' },
  { value: 'star', label: '科创板' }, { value: 'bj', label: '北交所' },
];
export default function MarketShell({
  title, path, children, trend = true,
}: { title: string; path: string; children: React.ReactNode; trend?: boolean }) {
  const {
    date, days, scope, status, error, select,
  } = useMarket();
  const dates = new Set(status?.dates || []);
  return (
    <Layout headerMenuActive={EHeaderMenuKey.analysis} asideMenuItems={analysisSiderMenuItems} asideMenuActive={path}>
      <div className="market-page p-16 rounded-[6px] bg-bg-white">
        <div className="market-heading">
          <Typography.Title level={4}>{title}</Typography.Title>
          <Tag>盘后数据</Tag>
        </div>
        <CSearchForm
          configs={[
            {
              name: 'date', label: '交易日期', component: <DatePicker />, attrs: { allowClear: false, disabledDate: (d: dayjs.Dayjs) => !dates.has(d.format('YYYY-MM-DD')) },
            },
            {
              name: 'scope', label: '统计范围', component: <Select />, attrs: { options: scopes, style: { width: 170 } },
            },
            ...(trend ? [{
              name: 'days', label: '趋势范围', component: <Select />, attrs: { style: { width: 160 }, options: [20, 60, 120, 250, 730].map((v) => ({ value: v, label: v === 730 ? '最近两年' : `近${v}个交易日` })) },
            }] : []),
          ]}
          searchParams={{ date: date ? dayjs(date) : undefined, scope, days }}
          setSearchParams={(v) => select({ date: v.date?.format('YYYY-MM-DD') || date, scope: v.scope, days: v.days || days })}
        />
        <Space className="market-status" wrap>
          <Typography.Text type="secondary">
            数据日期：
            {date || '暂无可用交易日'}
          </Typography.Text>
          {status?.stages.find((s) => s.task === 'market')?.updatedAt && (
          <Typography.Text type="secondary">
            最近更新：
            {dayjs(status.stages.find((s) => s.task === 'market')!.updatedAt).format('MM-DD HH:mm')}
          </Typography.Text>
          )}
        </Space>
        {error && <Alert type="error" showIcon message={error} />}
        {status && status.expectedDate !== status.latestDate && (
        <Alert
          type="warning"
          showIcon
          message={status.latestDate
            ? `${status.expectedDate || '最近交易日'} 数据尚未全部完成，当前展示最近可用数据。`
            : '尚无完整可展示的市场分析数据，需要先完成首次采集和汇总。'}
        />
        )}
        {status?.backfill && status.backfill.status !== 'success' && <Alert type="info" showIcon message={`历史补齐：${status.backfill.stage}${status.backfill.status === 'failed' ? '（失败，请查看数据同步）' : ''}`} />}
        {!status && !error && <Spin className="market-loading" />}
        {status && !date && <Empty description="暂无完整的市场分析数据" />}
        {status && date && children}
      </div>
    </Layout>
  );
}
