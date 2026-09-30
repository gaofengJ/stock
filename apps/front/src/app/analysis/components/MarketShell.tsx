'use client';

import {
  Alert, Button, DatePicker, Empty, Select, Typography,
} from 'antd';
import { beijingTime } from '@/utils/format';
import dayjs from 'dayjs';
import { BankOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import HelpTooltip from '@/components/HelpTooltip';
import { analysisSiderMenuItems } from '@/components/Layout/config';
import CSearchForm from '@/components/common/CSearchForm';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import { LoadingOverlay } from '@/components/Loading';
import { useMarket } from './MarketContext';
import { scopes } from './market-display';
import './market.sass';

export { scopes } from './market-display';
const analysisMenu = [...(analysisSiderMenuItems || []), { key: '/analysis/dragon', label: '龙虎榜', icon: <BankOutlined /> }];
const renderScopeOption = (option: { data: typeof scopes[number] }) => (
  <span className="market-scope-option">
    <span>{option.data.label}</span>
    <HelpTooltip label={option.data.label} title={option.data.description} stopPropagation />
  </span>
);
export default function MarketShell({
  title, path, children,
}: { title: string; path: string; children: React.ReactNode }) {
  const {
    date, scope, status, error, select, retry,
  } = useMarket();
  const dates = new Set(status?.dates || []);
  return (
    <Layout headerMenuActive={EHeaderMenuKey.analysis} asideMenuItems={analysisMenu} asideMenuActive={path}>
      <div className="market-page p-16 rounded-[6px] bg-bg-white">
        <div className="market-heading">
          <Typography.Title level={1}>{title}</Typography.Title>
          <HelpTooltip label={title} title={`数据日期：${date || '暂无可用交易日'}。更新于北京时间 ${beijingTime(status?.dateUpdates?.[date])}，为盘后数据。`} />
        </div>
        <CSearchForm
          configs={[
            {
              name: 'date', label: '交易日期', component: <DatePicker />, attrs: { allowClear: false, disabledDate: (d: dayjs.Dayjs) => !dates.has(d.format('YYYY-MM-DD')) },
            },
            {
              name: 'scope',
              label: '统计范围',
              component: <Select />,
              attrs: {
                options: scopes,
                style: { width: 170 },
                popupMatchSelectWidth: 240,
                optionRender: renderScopeOption,
              },
            },
          ]}
          searchParams={{ date: date ? dayjs(date) : undefined, scope }}
          setSearchParams={(v) => select({ date: v.date?.format('YYYY-MM-DD') || date, scope: v.scope })}
        />
        {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={retry}>重试</Button>} />}
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
        {!status && !error && <div className="market-initial-loading"><LoadingOverlay /></div>}
        {status && !date && <div className="market-empty"><Empty description="暂无数据" /></div>}
        {status && date && children}
      </div>
    </Layout>
  );
}
