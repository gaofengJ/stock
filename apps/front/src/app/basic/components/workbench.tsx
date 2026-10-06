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
export function SourceState({
  data, error, retry, pollingStopped = false,
}: { data: any; error?: string; retry: () => void; pollingStopped?: boolean }) {
  const pending = data?.sources?.filter((s: any) => s.state !== 'ready') || [];
  const sources = Array.from(new Set<string>(pending.map((s: any) => s.source)));
  const hasError = pending.some((s: any) => s.message || s.state === 'error');
  let notice = '正在获取资料，完成后自动更新';
  if (pollingStopped) notice = '部分资料尚未就绪，可稍后检查更新';
  if (hasError) notice = '部分资料暂时无法获取';
  return (
    <>
      {error && <Alert className="mb-16" type="error" message={error} action={<Button onClick={retry}>重试</Button>} />}
      {!error && !!pending.length && (
      <Alert
        className="mb-16"
        type={hasError ? 'warning' : 'info'}
        message={notice}
        description={(
          <div>
            <Space wrap>
              {sources.map((source) => {
                const entries = pending.filter((s: any) => s.source === source);
                const failed = entries.find((s: any) => s.message || s.state === 'error');
                const nextRetryAt = entries.map((s: any) => s.nextRetryAt).filter(Boolean).sort()[0];
                const title = nextRetryAt ? `下次可获取时间：${new Date(nextRetryAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` : '可检查资料是否已更新';
                let status = '获取中';
                if (pollingStopped) status = '尚未就绪';
                if (failed) status = '获取失败';
                return (
                  <Tooltip key={source} title={title}>
                    <span>
                      {sourceNames[source] || '其他资料'}
                      ：
                      {status}
                    </span>
                  </Tooltip>
                );
              })}
            </Space>
            {hasError && <p className="basic-muted">已取得的资料仍可查看。检查更新会重新读取现有资料；暂时无法获取的项目将在可重试时间后重新获取。</p>}
          </div>
      )}
        action={<Button size="small" onClick={retry}>检查更新</Button>}
      />
      )}
      {!pending.length && !!data?.sources?.length && (
      <p className="basic-muted">
        <Tooltip title={data.sources.map((s: any) => `${sourceNames[s.source] || '其他资料'}：${s.fetchedAt ? new Date(s.fetchedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '尚未获取'}`).join('；')}><span>查看资料更新时间</span></Tooltip>
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
      {showSourceState && <Tooltip title="标签仅覆盖已取得的风险记录，具体影响需结合公告正文核实。"><span className="basic-muted">{!data || data.sources?.some((s: any) => s.state !== 'ready') ? '资料尚不完整' : '标签仅含已取得记录'}</span></Tooltip>}
    </Space>
  );
}
