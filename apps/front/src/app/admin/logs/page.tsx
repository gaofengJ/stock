'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, AutoComplete, Button, Card, Collapse, DatePicker, Descriptions, Drawer, Form,
  Input, Select, Space, Tabs, Tag, Typography,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { FileSearchOutlined } from '@ant-design/icons';
import { InteractionButton } from '@/components/Interaction';
import Table from '@/components/DataTable';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';
import { api } from '@/auth/client';
import PageHeading from '@/auth/PageHeading';
import {
  actionLabels, auditDetail, auditResult, auditTarget, beijingDate, beijingTime, jobLink,
  levelColors, levelLabels, logGuidance, moduleLabels, resultLabels,
} from './log-display';

type Tab = 'logs' | 'audit-logs';
type Query = Record<string, string>;
interface Filters {
  dates: [Dayjs, Dayjs]; view?: string; keyword?: string; level?: string;
  module?: string; user?: string; action?: string; result?: string;
}
interface LogData {
  items: any[]; total: number; levels?: Record<string, number>; trend?: Record<string, number>;
  availableDates?: string[]; malformed?: number; truncated?: boolean; retentionDays: number;
}
interface Stats { sync: { source: string; status: string; count: number }[]; generatedAt: string }
const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const detailLabels: Record<string, string> = {
  startDate: '同步开始日期',
  endDate: '同步结束日期',
  active: '账号状态',
  nickname: '昵称',
  roleIds: '角色编号',
  permissions: '权限编码',
  error: '异常原因',
  message: '说明',
  name: '角色名称',
  code: '角色编码',
  description: '角色说明',
};
const detailText = (key: string, value: unknown) => {
  if (value === null || value === undefined) return '—';
  if (key === 'active' && typeof value === 'boolean') return value ? '正常' : '禁用';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

export default function Page() {
  const [tab, setTab] = useState<Tab>('logs');
  const [queries, setQueries] = useState<Record<Tab, Query>>({ logs: {}, 'audit-logs': {} });
  const query = queries[tab];
  const [ready, setReady] = useState(false);
  const [form] = Form.useForm<Filters>();
  const view = Form.useWatch('view', form);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<LogData>();
  const [stats, setStats] = useState<Stats>();
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [version, setVersion] = useState(0);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [logRetention, setLogRetention] = useState<number>();
  const { runLatestRequest } = useLatestRequest('admin-logs');

  useEffect(() => {
    const today = beijingDate();
    setQueries({ logs: { startDate: today, endDate: today, view: 'issues' }, 'audit-logs': { startDate: today, endDate: today } });
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    form.resetFields();
    form.setFieldsValue({ ...query, dates: [dayjs(query.startDate), dayjs(query.endDate)] });
  }, [form, query, ready]);
  const load = useCallback(() => runLatestRequest({
    request: () => api<LogData>(`/admin/${tab}?${new URLSearchParams({ ...query, page: String(page), pageSize: String(pageSize) })}`),
    onStart: () => { setLoading(true); setLoadError(''); setData(undefined); },
    onSuccess: (value) => {
      setData(value); setUpdatedAt(new Date().toISOString());
      if (tab === 'logs') setLogRetention(value.retentionDays);
    },
    onError: (e) => setLoadError(errorMessage(e)),
    onFinally: () => setLoading(false),
  }), [tab, query, page, pageSize, runLatestRequest]);
  useEffect(() => { if (ready) load(); }, [load, ready, version]);
  useEffect(() => {
    if (!ready || tab !== 'logs') return undefined;
    let disposed = false;
    setStats(undefined); setStatsError(''); setStatsLoading(true);
    api<Stats>(`/admin/stats?${new URLSearchParams({ startDate: query.startDate, endDate: query.endDate, refresh: '1' })}`)
      .then((value) => { if (!disposed) setStats(value); })
      .catch((e) => { if (!disposed) setStatsError(errorMessage(e)); })
      .finally(() => { if (!disposed) setStatsLoading(false); });
    return () => { disposed = true; };
  }, [query.startDate, query.endDate, ready, version, tab]);

  const apply = (v: Filters) => {
    const q: Query = { startDate: v.dates[0].format('YYYY-MM-DD'), endDate: v.dates[1].format('YYYY-MM-DD') };
    const fields = tab === 'logs' ? ['keyword', 'module', 'view', ...(v.view === 'all' ? ['level'] : [])] : ['keyword', 'user', 'action', 'result'];
    fields.forEach((key) => {
      const value = String(v[key as keyof Filters] || '').trim();
      if (value) q[key] = value;
    });
    setQueries((previous) => ({ ...previous, [tab]: q })); setPage(1); setVersion((v0) => v0 + 1);
  };
  const reset = () => {
    const today = beijingDate();
    setQueries((previous) => ({ ...previous, [tab]: { startDate: today, endDate: today, ...(tab === 'logs' ? { view: 'issues' } : {}) } }));
    setPage(1); setVersion((v) => v + 1);
  };
  const errorCount = data?.levels?.error || 0;
  const warnCount = data?.levels?.warn || 0;
  const failedCount = stats?.sync.reduce((sum, row) => sum + (row.status === 'failed' ? Number(row.count) : 0), 0);
  const detailFields = auditDetail(detail?.detail);
  const targetLink = detail && jobLink(detail.action || '', detail.target);
  const detailMessage = typeof detail?.message === 'string' ? detail.message : JSON.stringify(detail?.message ?? '');
  const logState = loading ? '加载中…' : '日志统计暂不可用';
  const statsState = statsLoading ? '加载中…' : '统计暂不可用';
  const emptyText = tab === 'logs' && query.view === 'issues' ? '当前筛选下没有错误或警告，可切换查看全部日志' : '没有符合条件的记录';

  return (
    <>
      <PageHeading title="日志分析" description="排查运行异常，或追溯账号、权限和数据维护操作。" icon={<FileSearchOutlined />} />
      <Tabs
        activeKey={tab}
        onChange={(value) => { setData(undefined); setLoading(true); setTab(value as Tab); setPage(1); setDetail(null); setUpdatedAt(''); }}
        items={[{ key: 'logs', label: '排查运行异常' }, { key: 'audit-logs', label: '查看操作记录' }]}
      />
      <Alert showIcon type="info" message={tab === 'logs' ? '应用日志：查看程序运行过程和异常原因。默认只看错误与警告，可切换查看全部日志。' : '操作审计：追溯谁在什么时候做了什么、结果如何。包含账号、权限及同步任务操作；不提供撤销或数据恢复。'} />
      <Form form={form} className="account-toolbar logs-filters" layout="inline" onFinish={apply}>
        <Form.Item
          name="dates"
          label="日期（北京）"
          rules={[{ required: true, message: '请选择查询日期' }, {
            validator: (_, value) => (!value || (value[1].diff(value[0], 'day') >= 0 && value[1].diff(value[0], 'day') <= 6)
              ? Promise.resolve() : Promise.reject(new Error('每次最多查询 7 天，请缩小日期范围'))),
          }]}
        >
          <DatePicker.RangePicker
            allowClear={false}
            aria-label="查询日期（北京时间）"
            presets={[
              { label: '今天', value: () => [dayjs(beijingDate()), dayjs(beijingDate())] },
              { label: '最近 7 天', value: () => [dayjs(beijingDate()).subtract(6, 'day'), dayjs(beijingDate())] },
            ]}
          />
        </Form.Item>
        <Form.Item name="keyword" label="搜索"><Input className="logs-keyword" allowClear maxLength={100} placeholder={tab === 'logs' ? '内容或模块关键词' : '用户、目标编号或操作内容'} aria-label="搜索关键词" /></Form.Item>
        {tab === 'logs' ? (
          <>
            <Form.Item name="view" label="范围"><Select aria-label="日志范围" className="logs-select" options={[{ value: 'issues', label: '错误与警告' }, { value: 'all', label: '全部日志' }]} /></Form.Item>
            {view === 'all' && <Form.Item name="level" label="级别" preserve={false}><Select className="logs-select" aria-label="日志级别" allowClear placeholder="全部级别" options={options(levelLabels)} /></Form.Item>}
            <Form.Item name="module" label="模块"><AutoComplete className="logs-module" aria-label="日志模块" allowClear placeholder="选择模块或输入名称" options={Object.entries(moduleLabels).map(([value, label]) => ({ value, label: `${label} · ${value}` }))} filterOption={(input, option) => String(option?.label).toLowerCase().includes(input.toLowerCase())} popupMatchSelectWidth={320} /></Form.Item>
          </>
        ) : (
          <>
            <Form.Item name="user" label="操作人"><Input className="logs-select" placeholder="用户名" allowClear aria-label="操作人" maxLength={64} /></Form.Item>
            <Form.Item name="action" label="操作"><Select className="logs-action" aria-label="操作类型" allowClear showSearch optionFilterProp="label" placeholder="全部操作" options={options(actionLabels)} /></Form.Item>
            <Form.Item name="result" label="结果"><Select className="logs-select" aria-label="操作结果" allowClear placeholder="全部结果" options={options(resultLabels)} /></Form.Item>
          </>
        )}
        <Space wrap>
          <Button type="primary" htmlType="submit" disabled={!ready} loading={loading && ready}>查询 / 刷新</Button>
          <Button onClick={reset} disabled={!ready}>重置筛选</Button>
        </Space>
      </Form>
      <div className="logs-range-note">
        <span>
          当前查询：
          {ready ? `${query.startDate} 至 ${query.endDate}（北京时间）` : '加载中…'}
          {' '}
          · 每次最多 7 天
        </span>
        <span>
          {tab === 'logs' ? `应用日志保留时长：${logRetention ? `${logRetention} 天` : '按服务配置'}` : '操作审计保留 90 天'}
          {updatedAt ? ` · 列表更新 ${beijingTime(updatedAt)}` : ''}
        </span>
      </div>
      {tab === 'logs' && (
        <div className="account-stats logs-stats">
          <Card size="small" title="当前筛选的日志">
            {data && !loading ? (
              <>
                <div className="logs-counts">
                  <Tag color="red">{`错误 ${errorCount}`}</Tag>
                  <Tag color="orange">{`警告 ${warnCount}`}</Tag>
                  {Object.entries(data.levels || {}).filter(([level]) => !['error', 'warn'].includes(level)).map(([level, count]) => <Tag key={level} color={levelColors[level]}>{`${levelLabels[level] || level} ${count}`}</Tag>)}
                  <span>
                    共
                    {data.total}
                    {' '}
                    条
                  </span>
                </div>
                <div className="logs-muted">按当前日期、搜索、范围、级别和模块统计；警告不等于任务失败。</div>
              </>
            ) : <span>{logState}</span>}
          </Card>
          <Card size="small" title="错误日志按日统计">
            {data && !loading ? (
              <>
                <div>
                  {Object.entries(data.trend || {}).map(([date, count]) => (
                    <div key={date} className="account-stat-line">
                      <span>{date}</span>
                      <strong>
                        {count}
                        {' '}
                        条
                      </strong>
                    </div>
                  ))}
                  {!errorCount && '当前筛选下没有错误级别日志'}
                </div>
                <div className="logs-muted">仅统计错误级别，不包含警告和同步任务失败。</div>
              </>
            ) : <span>{logState}</span>}
          </Card>
          <Card size="small" title="日期范围内创建的同步任务">
            {stats && !statsLoading && !statsError ? (
              <>
                <div className="logs-counts">
                  <Tag color={failedCount ? 'red' : 'default'}>{`当前失败 ${failedCount ?? 0}`}</Tag>
                  <span>
                    共
                    {stats?.sync.reduce((sum, r) => sum + Number(r.count), 0) ?? 0}
                    {' '}
                    个
                  </span>
                </div>
                <div className="logs-muted">按创建日期及当前状态统计，不受日志搜索条件影响。</div>
                <div className="logs-muted">{stats.sync.map((r) => `${r.source === 'scheduled' ? '自动' : '人工'} · ${resultLabels[r.status] || r.status} ${r.count}`).join('；') || '该日期范围没有任务'}</div>
                <Button type="link" href="/admin/sync/?status=failed" className="logs-task-link">查看全部失败任务</Button>
              </>
            ) : <span>{statsState}</span>}
            {stats && (
            <div className="logs-muted">
              统计更新
              {beijingTime(stats.generatedAt)}
              {' '}
              · 点击查询 / 刷新重新统计
            </div>
            )}
          </Card>
        </div>
      )}
      {tab === 'audit-logs' && <Typography.Paragraph type="secondary">误点维护操作时，可按操作人或任务编号查找记录，再打开对应任务核对执行结果。两个标签的筛选条件分别保留。</Typography.Paragraph>}
      {statsError && tab === 'logs' && <Alert type="warning" showIcon message={`同步任务统计暂不可用：${statsError}`} action={<Button onClick={() => setVersion((v) => v + 1)}>重试</Button>} />}
      {loadError && <Alert type="error" showIcon message={`查询失败：${loadError}`} action={<Button onClick={() => setVersion((v) => v + 1)}>重试当前查询</Button>} />}
      {data?.truncated && <Alert type="warning" showIcon message="日志超过单次 128 MB 扫描上限，列表和日志统计只包含优先读取的最新记录。请缩小日期范围。" />}
      <div className="logs-range-note">
        <span>{loading ? '正在查询…' : `找到 ${data?.total ?? 0} 条${tab === 'logs' ? '日志' : '操作记录'}`}</span>
        {tab === 'logs' && data && (
        <span>
          有日志的日期：
          {data.availableDates?.join('、') || '无'}
          {data.malformed ? ` · 已跳过 ${data.malformed} 行无效日志` : ''}
        </span>
        )}
      </div>
      <Table
        loading={loading}
        size="middle"
        scroll={{ x: 1000 }}
        autoHeight={(data?.items.length ?? 0) <= 5}
        rowKey="id"
        dataSource={data?.items || []}
        locale={{ emptyText: loadError ? '查询未成功，请重试' : emptyText }}
        pagination={{
          current: page, pageSize, total: data?.total || 0, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `共 ${total} 条`, onChange: (next, size) => { setPage(size === pageSize ? next : 1); setPageSize(size); },
        }}
        columns={tab === 'logs' ? [
          {
            title: '时间（北京）', dataIndex: 'timestamp', width: 185, className: 'admin-cell-nowrap', render: beijingTime,
          },
          {
            title: '级别', dataIndex: 'level', width: 90, render: (v) => <Tag color={levelColors[v]}>{levelLabels[v] || v}</Tag>,
          },
          {
            title: '模块', dataIndex: 'context', width: 170, render: (v) => <span title={v}>{moduleLabels[v] || v || '—'}</span>,
          },
          {
            title: '内容', dataIndex: 'message', className: 'admin-log-message', render: (v) => <div className="logs-message-preview">{typeof v === 'string' ? v : JSON.stringify(v)}</div>,
          },
          { title: '详情', width: 90, render: (_, r) => <InteractionButton intent="preview" onClick={() => setDetail(r)}>查看</InteractionButton> },
        ] : [
          {
            title: '时间（北京）', dataIndex: 'createdAt', width: 185, className: 'admin-cell-nowrap', render: beijingTime,
          },
          {
            title: '操作人', dataIndex: 'actorName', width: 140, render: (v) => (v === 'system' ? '系统自动' : v || '—'),
          },
          {
            title: '操作', dataIndex: 'action', width: 180, render: (v) => actionLabels[v] || v,
          },
          { title: '操作对象', render: (_, r) => (jobLink(r.action, r.target) ? <Button type="link" href={jobLink(r.action, r.target)}>{auditTarget(r.action, r.target)}</Button> : auditTarget(r.action, r.target)) },
          {
            title: '结果', dataIndex: 'result', width: 130, render: (v, r) => <Tag color={({ failed: 'red', success: 'green' } as Record<string, string>)[v]}>{auditResult(r.action, v)}</Tag>,
          },
          { title: '详情', width: 90, render: (_, r) => <InteractionButton intent="preview" onClick={() => setDetail(r)}>查看</InteractionButton> },
        ]}
      />
      <Drawer className="logs-drawer" title={tab === 'logs' ? '运行日志详情' : '操作记录详情'} width="min(760px, 100vw)" open={!!detail} onClose={() => setDetail(null)}>
        {detail && (tab === 'logs' ? (
          <>
            <Alert showIcon type={({ error: 'error', warn: 'warning' } as Record<string, 'error' | 'warning'>)[detail.level] || 'info'} message={levelLabels[detail.level] || detail.level} description={logGuidance(detail.level, detail.context, detailMessage)} />
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                { key: 'time', label: '时间（北京）', children: beijingTime(detail.timestamp) },
                { key: 'module', label: '模块', children: `${moduleLabels[detail.context] || detail.context || '—'}${moduleLabels[detail.context] ? `（${detail.context}）` : ''}` },
              ]}
            />
            <Typography.Title level={4} className="logs-detail-heading">完整内容</Typography.Title>
            <pre className="account-detail">{detailMessage}</pre>
            <Button href="/admin/sync/">打开数据同步执行记录</Button>
          </>
        ) : (
          <>
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                { key: 'time', label: '时间（北京）', children: beijingTime(detail.createdAt) },
                { key: 'actor', label: '操作人', children: detail.actorName === 'system' ? '系统自动' : detail.actorName || '—' },
                { key: 'action', label: '操作', children: actionLabels[detail.action] || detail.action },
                { key: 'target', label: '操作对象', children: targetLink ? <Button type="link" href={targetLink}>{auditTarget(detail.action, detail.target)}</Button> : auditTarget(detail.action, detail.target) },
                { key: 'result', label: '结果', children: auditResult(detail.action, detail.result) },
                ...Object.entries(detailFields).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => ({ key: `detail-${key}`, label: detailLabels[key] || key, children: detailText(key, value) })),
              ]}
            />
            {!Object.keys(detailFields).length && <Typography.Paragraph className="logs-muted">这条操作没有附加说明。密码等敏感字段会脱敏，操作记录不提供撤销操作。</Typography.Paragraph>}
          </>
        ))}
        <Collapse className="logs-raw" items={[{ key: 'raw', label: '技术详情（原始记录）', children: <pre className="account-detail">{JSON.stringify(detail, null, 2)}</pre> }]} />
      </Drawer>
    </>
  );
}
