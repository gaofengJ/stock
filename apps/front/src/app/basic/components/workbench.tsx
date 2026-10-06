'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Button, Popover, Space, Tag, Tooltip,
} from 'antd';
import Link from '@/components/Interaction';
import request from '@/api/request';
import { useAccount } from '@/auth/Boundary';
import { allowedPath } from '@/auth/client';
import { errorMessage } from '@/api/errors';
import Layout from '@/components/Layout';
import { basicSiderMenuItems } from '@/components/Layout/config';
import { EHeaderMenuKey } from '@/components/Layout/enum';
import './workbench.css';
import { startWorkbenchPolling } from './workbench-polling';
import { currentReduction, riskTypeLabel } from './risk-display';
import { sourceNames, sourceTimeRows } from './source-display';

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
export function useWorkbench(endpoint: string, params: Record<string, unknown>, active?: boolean, dataScope?: string) {
  const enabled = active ?? true;
  const [result, setResult] = useState<{ key: string; scope: string; data: any; error: string; loading: boolean; pollingStopped: boolean }>({
    key: '', scope: '', data: null, error: '', loading: true, pollingStopped: false,
  });
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([endpoint, params]);
  // Pagination changes the request, but must not remove notices that determine the table's position.
  const scope = dataScope === undefined ? key : JSON.stringify([endpoint, dataScope]);
  useEffect(() => {
    if (!enabled) return undefined;
    setResult((old) => ({
      key, scope, data: old.scope === scope ? old.data : null, error: dataScope !== undefined && old.scope === scope ? old.error : '', loading: true, pollingStopped: false,
    }));
    return startWorkbenchPolling<any>({
      read: async (signal) => (await request.get<any>(`/basic/workbench/${endpoint}`, { params: JSON.parse(key)[1], signal, autoShowError: false })).data,
      onValue: (data) => setResult({
        key, scope, data, error: '', loading: false, pollingStopped: false,
      }),
      onError: (error) => setResult((old) => ({
        ...old, error: errorMessage(error, '加载失败，请重试'), loading: false, pollingStopped: true,
      })),
      onStopped: () => setResult((old) => ({ ...old, pollingStopped: true })),
    });
  }, [endpoint, key, scope, dataScope, enabled, attempt]);
  const current = enabled && result.key === key;
  const compatible = enabled && result.scope === scope;
  return {
    data: compatible ? result.data : null,
    error: compatible && (current || dataScope !== undefined) ? result.error : '',
    loading: enabled && (!current || result.loading),
    pollingStopped: current && result.pollingStopped,
    retry: () => setAttempt((v) => v + 1),
  };
}
export function SourceState({
  data, error, retry, pollingStopped = false, loading = false,
}: { data: any; error?: string; retry: () => void; pollingStopped?: boolean; loading?: boolean }) {
  const pending = data?.sources?.filter((s: any) => s.state !== 'ready' && s.state !== 'unpublished') || [];
  const unpublished = Array.from(new Set<string>((data?.sources || []).filter((s: any) => s.state === 'unpublished').map((s: any) => s.period || '部分月份')));
  const sources = Array.from(new Set<string>(pending.map((s: any) => s.source)));
  const hasError = pending.some((s: any) => s.message || s.state === 'error');
  let notice = '正在获取资料，完成后自动更新';
  if (pollingStopped) notice = '部分资料尚未就绪，可稍后检查更新';
  if (hasError) notice = '部分资料暂时无法获取';
  if (!error && !pending.length && !data?.sources?.length) return null;
  return (
    <div className="workbench-source-state">
      {!!unpublished.length && <p className="basic-muted">{`尚未发布的日程：${unpublished.join('、')}。已发布日程仍可查看，后续将定期检查更新。`}</p>}
      {error && <Alert className="mb-16" type="error" message={error} action={<Button loading={loading} onClick={retry}>重试</Button>} />}
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
        action={<Button size="small" loading={loading} onClick={retry}>检查更新</Button>}
      />
      )}
      {!pending.length && !!data?.sources?.length && (
      <Popover
        trigger="click"
        placement="bottomLeft"
        title="资料获取时间（北京时间）"
        content={(
          <div className="source-time-content">
            <p>以下为系统获取资料的时间，与观察日期、公告日期不同。同类资料的多次获取显示最早至最近时间。</p>
            <dl className="source-time-list">
              {sourceTimeRows(data.sources).map((row) => (
                <div className="source-time-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.time}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      >
        <Button type="link" size="small" className="source-time-trigger">查看资料获取时间</Button>
      </Popover>
      )}
    </div>
  );
}
export function RiskTags({
  data, code, date, showSourceState = true,
}: { data: any; code: string; date?: string; showSourceState?: boolean }) {
  const { user } = useAccount();
  const canLink = allowedPath(user, '/basic/stock/risk');
  const items = data?.items?.filter((r: any) => r.tsCode === code && (r.type !== '减持' || currentReduction(r, date || data?.date))) || [];
  const labels = Array.from(new Set<string>(items.map((r: any) => r.type)));
  if (!showSourceState && !labels.length) return null;
  return (
    <Space size={2} wrap>
      {labels.map((label) => (canLink ? <Link key={label} href={`/basic/stock/risk/?code=${code}&date=${date || ''}`}><Tag color={label === '复牌' ? 'blue' : 'orange'}>{riskTypeLabel(label)}</Tag></Link> : <Tag color="orange" key={label}>{riskTypeLabel(label)}</Tag>))}
      {showSourceState && <Tooltip title="标签仅覆盖已取得的风险记录，具体影响需结合公告正文核实。"><span className="basic-muted">{!data || data.reductionCoverage?.unknown || data.sources?.some((s: any) => s.state !== 'ready') ? '资料尚不完整' : '标签仅含已取得记录'}</span></Tooltip>}
    </Space>
  );
}
