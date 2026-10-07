'use client';

import {
  Alert, Button, Card, Descriptions, Space, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InteractionButton } from '@/components/Interaction';
import {
  accessGuidance, accessStatus, accessUser, beijingTime, durationText, accessColor, accessAlertType,
} from './log-display';

export interface AccessEntry {
  id: string; requestId: string; timestamp: string; actorType: string;
  userId?: number; username?: string; nickname?: string;
  method: string; path: string; route: string; result: string;
  statusCode: number; durationMs: number; ip: string; userAgent: string;
  query: Record<string, string | string[]>; errorMessage?: string;
  ipSource?: string;
}
export interface AccessSummary {
  requests: number; failed: number; slow: number; users: number; avgDurationMs: number;
}
export function AccessOverview({ summary, loading, slowMs }: { summary?: AccessSummary; loading: boolean; slowMs: number }) {
  return (
    <div className="account-stats logs-access-stats">
      {[
        ['接口请求', summary?.requests, '一次接口调用计一条记录'],
        ['失败请求', summary?.failed, '包含未登录、无权限和服务异常'],
        ['慢请求', summary?.slow, `响应耗时 ≥ ${durationText(slowMs)}`],
        ['登录用户', summary?.users, '按用户编号去重；不包含游客'],
      ].map(([label, value, note]) => (
        <Card size="small" title={label} key={label}>
          <strong className="logs-metric">{loading ? '…' : value ?? '—'}</strong>
          <div className="logs-muted">{note}</div>
        </Card>
      ))}
    </div>
  );
}
export function accessColumns(open: (row: AccessEntry) => void, slowMs: number): ColumnsType<AccessEntry> {
  return [
    {
      title: '时间（北京）', dataIndex: 'timestamp', width: 185, className: 'admin-cell-nowrap', render: beijingTime,
    },
    {
      title: '访问用户',
      width: 195,
      render: (_, row) => (
        <div className="logs-identity">
          <span>{accessUser(row)}</span>
          {row.userId && <small>{`用户 #${row.userId}`}</small>}
        </div>
      ),
    },
    {
      title: '接口',
      render: (_, row) => (
        <div className="logs-endpoint">
          <Tag>{row.method}</Tag>
          <span>{row.path}</span>
        </div>
      ),
    },
    { title: '结果', width: 240, render: (_, row) => <Tag color={accessColor(row.statusCode)}>{accessStatus(row)}</Tag> },
    {
      title: '耗时',
      width: 145,
      render: (_, row) => (
        <span className={row.durationMs >= slowMs ? 'logs-slow' : ''}>
          {durationText(row.durationMs)}
          {row.durationMs >= slowMs && '（慢请求）'}
        </span>
      ),
    },
    {
      title: '来源 IP', dataIndex: 'ip', width: 150, render: (value) => value || '—',
    },
    { title: '详情', width: 90, render: (_, row) => <InteractionButton intent="preview" onClick={() => open(row)}>查看</InteractionButton> },
  ];
}
export function AccessDetail({ row, slowMs, related }: {
  row: AccessEntry; slowMs: number; related: (tab: 'logs' | 'audit-logs', requestId: string, timestamp: string) => void;
}) {
  return (
    <>
      <Alert showIcon type={accessAlertType(row.statusCode)} message={accessStatus(row)} description={accessGuidance(row.statusCode)} />
      <Descriptions
        bordered
        column={1}
        size="small"
        items={[
          { key: 'time', label: '时间（北京）', children: beijingTime(row.timestamp) },
          { key: 'user', label: '访问用户', children: accessUser(row) },
          { key: 'userId', label: '用户编号', children: row.userId || '—' },
          { key: 'path', label: '接口', children: `${row.method} ${row.path}` },
          { key: 'route', label: '接口模板', children: row.route },
          { key: 'duration', label: '响应耗时', children: `${durationText(row.durationMs)}${row.durationMs >= slowMs ? '（慢请求）' : ''}` },
          { key: 'error', label: '异常说明', children: row.errorMessage || '—' },
          { key: 'ip', label: '来源 IP', children: row.ip || '—' },
          { key: 'ipSource', label: 'IP 依据', children: row.ipSource === 'trusted-proxy' ? '可信代理转发的客户端地址' : '连接地址；经过代理时可能为代理 IP' },
          { key: 'agent', label: '客户端', children: row.userAgent || '—' },
          { key: 'id', label: '请求编号', children: <Typography.Text copyable>{row.requestId}</Typography.Text> },
        ]}
      />
      <Typography.Title level={4} className="logs-detail-heading">继续排查</Typography.Title>
      <Space wrap>
        <Button onClick={() => related('logs', row.requestId, row.timestamp)}>查看同一请求的系统日志</Button>
        <Button onClick={() => related('audit-logs', row.requestId, row.timestamp)}>查看同一请求的操作审计</Button>
      </Space>
      <Typography.Paragraph className="logs-muted">普通查询接口可能没有系统日志或操作审计。接口访问成功只表示该请求正常响应。</Typography.Paragraph>
      <Typography.Title level={4} className="logs-detail-heading">查询参数</Typography.Title>
      <pre className="account-detail">{Object.keys(row.query || {}).length ? JSON.stringify(row.query, null, 2) : '没有可展示的查询参数'}</pre>
      <Typography.Paragraph className="logs-muted">只保存日期、分页等必要参数；密码、Cookie、令牌、请求正文及响应正文不记录。</Typography.Paragraph>
    </>
  );
}
