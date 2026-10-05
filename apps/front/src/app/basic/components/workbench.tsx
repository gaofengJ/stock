'use client';

import { useEffect, useState } from 'react';
import Link from '@/components/Interaction';
import {
  Alert, Button, Space, Tag, Tooltip,
} from 'antd';
import request from '@/api/request';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { errorMessage } from '@/api/errors';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import './workbench.css';
import { startWorkbenchPolling } from './workbench-polling';

export function stockHref(code: string, date?: string) {
  return `/basic/stock/detail/?code=${encodeURIComponent(code)}${date ? `&date=${date}` : ''}`;
}
export function StockLink({ code, name, date }: { code: string; name?: string; date?: string }) {
  const { user } = useAccount();
  if (!allowedPath(user, '/basic/stock')) return <span>{name || code}</span>;
  return <Link href={stockHref(code, date)}>{name || code}</Link>;
}
export function BasicShell({ title, path, children }: { title?: string; path: string; children: React.ReactNode }) {
  return (
    <Layout asideMenuItems={basicSiderMenuItems} headerMenuActive={EHeaderMenuKey.basic} asideMenuActive={path}>
      <main className="p-16 rounded-[6px] bg-bg-white basic-workbench">
        {title && <h1 className="page-heading">{title}</h1>}
        {children}
      </main>
    </Layout>
  );
}
export function useWorkbench(endpoint: string, params: Record<string, unknown>, enabled = true) {
  const [result, setResult] = useState<{ key: string; data: any; error: string; loading: boolean; pollingStopped: boolean }>({
    key: '', data: null, error: '', loading: true, pollingStopped: false,
  });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([endpoint, params]);
  useEffect(() => {
    if (!enabled) return undefined;
    setResult((old) => ({
      key, data: old.key === key ? old.data : null, error: '', loading: true, pollingStopped: false,
    }));
    return startWorkbenchPolling<any>({
      read: async (signal) => (await request.get<any>(`/basic/workbench/${endpoint}`, { params: JSON.parse(key)[1], signal, autoShowError: false })).data,
      onValue: (data) => setResult({
        key, data, error: '', loading: false, pollingStopped: false,
      }),
      onError: (error) => setResult((old) => ({
        ...old, error: errorMessage(error, '加载失败，请重试'), loading: false, pollingStopped: true,
      })),
      onStopped: () => setResult((old) => ({ ...old, pollingStopped: true })),
    });
  }, [endpoint, key, enabled, attempt]);
  const current = enabled && result.key === key;
  return {
    data: current ? result.data : null,
    error: current ? result.error : '',
    loading: enabled && (!current || result.loading),
    pollingStopped: current && result.pollingStopped,
    retry: () => setAttempt((v) => v + 1),
  };
}
const sourceNames: Record<string, string> = {
  stk_holdertrade: '股东减持',
  eastmoney_ann: '东方财富公告',
  anns_d: '公司公告',
  fina_audit: '审计意见',
  balancesheet: '资产负债表',
  stock_company: '公司资料',
  stock_st: 'ST状态',
  st: 'ST原因',
  suspend_d: '停复牌',
  stk_shock: '异常波动',
  stk_high_shock: '严重异动',
  stk_alert: '交易所提示',
  share_float: '解禁',
  disclosure_date: '财报披露',
  forecast: '业绩预告',
  express: '业绩快报',
  dividend: '除权除息',
  fina_indicator: '财务指标',
  cashflow: '现金流',
  top_inst: '龙虎榜席位',
};
export function SourceState({ data, error, retry }: { data: any; error?: string; retry: () => void }) {
  const pending = data?.sources?.filter((s: any) => s.state !== 'ready') || [];
  const sources = Array.from(new Set<string>(pending.map((s: any) => s.source)));
  const hasError = pending.some((s: any) => s.message);
  return (
    <>
      {error && <Alert className="mb-16" type="error" message={error} action={<Button onClick={retry}>重试</Button>} />}
      {!!pending.length && <Alert className="mb-16" type={hasError ? 'warning' : 'info'} message={hasError ? '部分来源暂不可用，已保留可用资料' : '正在补齐资料，完成后自动更新'} description={<Space wrap>{sources.map((source) => <Tooltip key={source} title={pending.find((s: any) => s.source === source)?.message || '尚未取得完整快照'}><span>{sourceNames[source] || source}</span></Tooltip>)}</Space>} action={<Button size="small" onClick={retry}>刷新</Button>} />}
      {!pending.length && !!data?.sources?.length && (
      <p className="basic-muted">
        数据来源：Tushare
        {data.sources.some((s: any) => s.source === 'eastmoney_ann') ? '、东方财富公告' : ''}
        。
        <Tooltip title={data.sources.map((s: any) => `${sourceNames[s.source] || s.source}：${s.fetchedAt ? new Date(s.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '尚未获取'}`).join('；')}><span>查看更新时间</span></Tooltip>
      </p>
      )}
    </>
  );
}
export function RiskTags({
  data, code, date, showSourceState = true,
}: { data: any; code: string; date?: string; showSourceState?: boolean }) {
  const { user } = useAccount();
  const canLink = allowedPath(user, '/basic/stock/risk');
  const items = data?.items?.filter((r: any) => r.tsCode === code) || [];
  const labels = Array.from(new Set<string>(items.map((r: any) => r.type)));
  if (!showSourceState && !labels.length) return null;
  return (
    <Space size={2} wrap>
      {labels.map((label) => (canLink ? <Link key={label} href={`/basic/stock/risk/?code=${code}&date=${date || ''}`}><Tag color={label === '复牌' ? 'blue' : 'orange'}>{label}</Tag></Link> : <Tag color="orange" key={label}>{label}</Tag>))}
      {showSourceState && <Tooltip title="标签仅覆盖已取得的风险记录。减持计划、重大利空及潜在ST／退市风险需结合公告正文逐股核验。"><span className="basic-muted">{!data || data.sources?.some((s: any) => s.state !== 'ready') ? '资料待补齐' : '其他风险待核验'}</span></Tooltip>}
    </Space>
  );
}
