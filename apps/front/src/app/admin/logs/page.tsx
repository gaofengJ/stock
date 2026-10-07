'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, AutoComplete, Button, Card, Collapse, DatePicker, Descriptions, Drawer, Form,
  Input, Select, Space, Tabs, Tag, Typography,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
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
  accessResults, actorLabels, requestDate, durationText,
} from './log-display';
import {
  AccessDetail, AccessOverview, AccessSummary, accessColumns,
} from './access-view';

type Tab = 'access-logs' | 'logs' | 'audit-logs';
type Query = Record<string, string>;
interface Filters {
  dates: [Dayjs, Dayjs]; view?: string; keyword?: string; level?: string;
  module?: string; user?: string; action?: string; result?: string; requestId?: string;
  actorType?: string; path?: string; method?: string; slow?: string;
}
interface LogData {
  items: any[]; total: number; levels?: Record<string, number>; trend?: Record<string, number>;
  availableDates?: string[]; malformed?: number; truncated?: boolean; retentionDays: number;
  summary?: AccessSummary; slowMs?: number;
}
const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const tabLabels: Record<Tab, string> = { 'access-logs': '接口访问', logs: '系统日志', 'audit-logs': '操作审计' };
const tabDescriptions: Record<Tab, string> = {
  'access-logs': '查谁访问了哪些接口、是否成功、耗时多久。包含未登录和无权限的请求；新记录从本次升级后开始，历史访问无法补录。',
  logs: '排查服务运行异常。默认只看错误与警告；普通接口调用统一在“接口访问”查看。',
  'audit-logs': '追溯账号、角色权限及数据维护操作。普通查询接口不会逐条记录；审计不提供撤销或数据恢复。',
};
function defaultQuery(value: Tab, date = beijingDate()): Query {
  return { startDate: date, endDate: date, ...(value === 'logs' ? { view: 'issues' } : {}) };
}
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
  registered: '注册后自动登录',
  isAdmin: '登录时为管理员',
  status: '任务状态',
  content: '内容',
  avatar: '头像',
};
const detailText = (key: string, value: unknown) => {
  if (value === null || value === undefined) return '—';
  if (key === 'active' && typeof value === 'boolean') return value ? '正常' : '禁用';
  if (['registered', 'isAdmin'].includes(key) && typeof value === 'boolean') return value ? '是' : '否';
  if (key === 'status' && typeof value === 'string') return resultLabels[value] || value;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

export default function Page() {
  const [tab, setTab] = useState<Tab>('access-logs');
  const [queries, setQueries] = useState<Record<Tab, Query>>({ 'access-logs': {}, logs: {}, 'audit-logs': {} });
  const query = queries[tab];
  const [ready, setReady] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [form] = Form.useForm<Filters>();
  const view = Form.useWatch('view', form);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<LogData>();
  const [version, setVersion] = useState(0);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const { runLatestRequest } = useLatestRequest('admin-logs');

  useEffect(() => {
    const initial = { 'access-logs': defaultQuery('access-logs'), logs: defaultQuery('logs'), 'audit-logs': defaultQuery('audit-logs') };
    const url = new URLSearchParams(window.location.search);
    const selected = url.get('tab') as Tab;
    if (Object.keys(tabLabels).includes(selected)) {
      const id = url.get('requestId'); const date = url.get('date');
      const q = defaultQuery(selected, date && /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date).format('YYYY-MM-DD') === date ? date : undefined);
      if (id && /^[a-f0-9-]{36}$/.test(id)) { q.requestId = id; if (selected === 'logs') q.view = 'all'; }
      initial[selected] = q; setTab(selected);
    }
    setQueries(initial);
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
    },
    onError: (e) => setLoadError(errorMessage(e)),
    onFinally: () => setLoading(false),
  }), [tab, query, page, pageSize, runLatestRequest]);
  useEffect(() => { if (ready) load(); }, [load, ready, version]);

  const apply = (v: Filters) => {
    const q: Query = { startDate: v.dates[0].format('YYYY-MM-DD'), endDate: v.dates[1].format('YYYY-MM-DD') };
    const filterFields: Record<Tab, string[]> = {
      logs: ['keyword', 'module', 'view', 'requestId', ...(v.view === 'all' ? ['level'] : [])],
      'access-logs': ['keyword', 'user', 'actorType', 'path', 'method', 'result', 'slow', 'requestId'],
      'audit-logs': ['keyword', 'user', 'action', 'result', 'requestId'],
    };
    const fields = filterFields[tab];
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
  const changeTab = (value: Tab) => { setData(undefined); setLoading(true); setTab(value); setPage(1); setDetail(null); setUpdatedAt(''); setLoadError(''); };
  const related = (value: Tab, requestId: string, timestamp: string) => {
    const date = dayjs(requestDate(timestamp));
    // A request can begin before midnight and finish after midnight.
    setQueries((previous) => ({
      ...previous,
      [value]: {
        ...defaultQuery(value), startDate: date.subtract(1, 'day').format('YYYY-MM-DD'), endDate: date.add(1, 'day').format('YYYY-MM-DD'), requestId, ...(value === 'logs' ? { view: 'all' } : {}),
      },
    }));
    changeTab(value);
  };
  const quickAccess = (result?: string, slow?: string) => { form.setFieldsValue({ result, slow }); form.submit(); };
  const errorCount = data?.levels?.error || 0;
  const warnCount = data?.levels?.warn || 0;
  const detailFields = auditDetail(detail?.detail);
  const detailId = detail?.requestId || detailFields.requestId;
  const detailTime = detail?.timestamp || detail?.createdAt;
  const slowMs = data?.slowMs || 1000;
  const targetLink = detail && jobLink(detail.action || '', detail.target);
  const detailMessage = typeof detail?.message === 'string' ? detail.message : JSON.stringify(detail?.message ?? '');
  const logState = loading ? '加载中…' : '日志统计暂不可用';
  let emptyText = '没有符合条件的记录';
  if (tab === 'access-logs') emptyText = '没有符合条件的访问记录。新记录从本次升级后开始。';
  if (tab === 'logs' && query.view === 'issues') emptyText = '当前筛选下没有错误或警告，可切换查看全部系统日志';
  if (query.requestId) emptyText = '同一请求没有这类记录。普通查询可能不产生系统日志或操作审计。';
  const keywordPlaceholders: Record<Tab, string> = { logs: '内容或模块关键词', 'access-logs': '接口、用户、IP 或异常说明', 'audit-logs': '用户、目标编号或操作内容' };
  const retentionText = tab === 'audit-logs' ? '操作审计保留 90 天' : `${tabLabels[tab]}保留时长：${data?.retentionDays ? `${data.retentionDays} 天` : '按服务配置'}`;
  let summaryText = `找到 ${data?.total ?? 0} 条${tabLabels[tab]}记录`;
  if (loading) summaryText = '正在查询…';
  else if (loadError) summaryText = '查询未成功';

  const systemColumns: ColumnsType<any> = [
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
    { title: '访问用户', width: 140, render: (_, row) => row.username || (row.userId ? `用户 #${row.userId}` : '—') },
    { title: '详情', width: 90, render: (_, r) => <InteractionButton intent="preview" onClick={() => setDetail(r)}>查看</InteractionButton> },
  ];
  const auditColumns: ColumnsType<any> = [
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
  ];
  let columns = auditColumns;
  if (tab === 'logs') columns = systemColumns;
  if (tab === 'access-logs') columns = accessColumns(setDetail, slowMs);

  return (
    <>
      <PageHeading title="日志中心" description="查接口访问、排查系统异常、追溯关键操作。" icon={<FileSearchOutlined />} />
      <Tabs
        activeKey={tab}
        onChange={(value) => changeTab(value as Tab)}
        items={Object.entries(tabLabels).map(([key, label]) => ({ key, label }))}
      />
      <Alert showIcon type="info" message={tabDescriptions[tab]} />
      {tab === 'access-logs' && (
      <div className="logs-quick">
        <span>快速查看</span>
        <Button aria-pressed={!query.result && !query.slow} type={!query.result && !query.slow ? 'primary' : 'default'} onClick={() => quickAccess()}>全部访问</Button>
        <Button aria-pressed={query.result === 'failed' && !query.slow} type={query.result === 'failed' && !query.slow ? 'primary' : 'default'} onClick={() => quickAccess('failed')}>失败请求</Button>
        <Button aria-pressed={query.slow === '1' && !query.result} type={query.slow === '1' && !query.result ? 'primary' : 'default'} onClick={() => quickAccess(undefined, '1')}>慢请求</Button>
      </div>
      )}
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
        <Form.Item name="keyword" label="搜索" hidden={tab === 'access-logs' && !advanced}><Input className="logs-keyword" allowClear maxLength={100} placeholder={keywordPlaceholders[tab]} aria-label="搜索关键词" /></Form.Item>
        {tab === 'access-logs' && (
          <>
            <Form.Item name="user" label="用户"><Input className="logs-user" allowClear maxLength={64} placeholder="用户名、昵称或编号" aria-label="访问用户" /></Form.Item>
            <Form.Item name="actorType" label="身份" hidden={!advanced}><Select className="logs-select" allowClear placeholder="全部身份" aria-label="访问身份" options={options(actorLabels)} /></Form.Item>
            <Form.Item name="path" label="接口"><Input className="logs-keyword" allowClear maxLength={512} placeholder="例如 /api/basic/daily" aria-label="接口路径" /></Form.Item>
            <Form.Item name="method" label="方法" hidden={!advanced}><Select className="logs-method" allowClear placeholder="全部" aria-label="请求方法" options={['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item name="result" label="结果"><Select className="logs-action" allowClear placeholder="全部结果" aria-label="访问结果" options={options(accessResults)} /></Form.Item>
            <Form.Item name="slow" label="耗时" hidden={!advanced}><Select className="logs-select" allowClear placeholder="全部耗时" aria-label="访问耗时" options={[{ value: '1', label: `慢请求 ≥ ${durationText(slowMs)}` }]} /></Form.Item>
          </>
        )}
        {tab === 'logs' && (
          <>
            <Form.Item name="view" label="范围"><Select aria-label="日志范围" className="logs-select" options={[{ value: 'issues', label: '错误与警告' }, { value: 'all', label: '全部系统日志' }]} /></Form.Item>
            {view === 'all' && <Form.Item name="level" label="级别" preserve={false}><Select className="logs-select" aria-label="日志级别" allowClear placeholder="全部级别" options={options(levelLabels)} /></Form.Item>}
            <Form.Item name="module" label="模块"><AutoComplete className="logs-module" aria-label="日志模块" allowClear placeholder="选择模块或输入名称" options={Object.entries(moduleLabels).map(([value, label]) => ({ value, label: `${label} · ${value}` }))} filterOption={(input, option) => String(option?.label).toLowerCase().includes(input.toLowerCase())} popupMatchSelectWidth={320} /></Form.Item>
          </>
        )}
        {tab === 'audit-logs' && (
          <>
            <Form.Item name="user" label="操作人"><Input className="logs-select" placeholder="用户名" allowClear aria-label="操作人" maxLength={64} /></Form.Item>
            <Form.Item name="action" label="操作"><Select className="logs-action" aria-label="操作类型" allowClear showSearch optionFilterProp="label" placeholder="全部操作" options={options(actionLabels)} /></Form.Item>
            <Form.Item name="result" label="结果"><Select className="logs-select" aria-label="操作结果" allowClear placeholder="全部结果" options={options(resultLabels)} /></Form.Item>
          </>
        )}
        <Form.Item name="requestId" label="请求编号" hidden={!advanced && !query.requestId} rules={[{ pattern: /^[a-f0-9-]{36}$/, message: '请输入完整的请求编号' }]}><Input className="logs-keyword" allowClear maxLength={36} placeholder="按同一次请求关联查询" aria-label="请求编号" /></Form.Item>
        <Space wrap>
          <Button type="primary" htmlType="submit" disabled={!ready} loading={loading && ready}>查询 / 刷新</Button>
          <Button onClick={reset} disabled={!ready}>重置筛选</Button>
          <Button type="text" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? '收起高级筛选' : '展开高级筛选'}</Button>
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
          {retentionText}
          {updatedAt ? ` · 列表更新 ${beijingTime(updatedAt)}` : ''}
        </span>
      </div>
      {tab === 'access-logs' && <AccessOverview summary={data?.summary} loading={loading} slowMs={slowMs} />}
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
          <Card size="small" title="定位同一次请求">
            <div>从接口访问详情复制请求编号，或点击关联查询，查看该请求产生的系统日志与操作审计。</div>
            <div className="logs-muted">定时任务和历史记录可能没有请求编号。任务进度与失败原因仍在数据同步执行记录查看。</div>
            <Button type="link" onClick={() => changeTab('access-logs')}>查看接口访问</Button>
          </Card>
        </div>
      )}
      {tab === 'audit-logs' && <Typography.Paragraph type="secondary">误点维护操作时，可按操作人或任务编号查找记录，再打开对应任务核对执行结果。三个标签的筛选条件分别保留。</Typography.Paragraph>}
      {loadError && <Alert type="error" showIcon message={`查询失败：${loadError}`} action={<Button onClick={() => setVersion((v) => v + 1)}>重试当前查询</Button>} />}
      {data?.truncated && <Alert type="warning" showIcon message="日志超过单次 128 MB 扫描上限，列表和日志统计只包含优先读取的最新记录。请缩小日期范围。" />}
      <div className="logs-range-note">
        <span>
          {summaryText}
          {tab === 'access-logs' && data?.summary ? ` · 平均耗时 ${durationText(data.summary.avgDurationMs)} · 统计按当前筛选条件计算` : ''}
        </span>
        {tab !== 'audit-logs' && data && (
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
        scroll={{ x: tab === 'access-logs' ? 1250 : 1100 }}
        autoHeight={(data?.items.length ?? 0) <= 5}
        rowKey="id"
        dataSource={data?.items || []}
        locale={{ emptyText: loadError ? '查询未成功，请重试' : emptyText }}
        pagination={{
          current: page, pageSize, total: data?.total || 0, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `共 ${total} 条`, onChange: (next, size) => { setPage(size === pageSize ? next : 1); setPageSize(size); },
        }}
        columns={columns}
      />
      <Drawer className="logs-drawer" title={`${tabLabels[tab]}详情`} width="min(780px, 100vw)" open={!!detail} onClose={() => setDetail(null)}>
        {detail && tab === 'access-logs' && <AccessDetail row={detail} slowMs={slowMs} related={related} />}
        {detail && tab === 'logs' && (
          <>
            <Alert showIcon type={({ error: 'error', warn: 'warning' } as Record<string, 'error' | 'warning'>)[detail.level] || 'info'} message={levelLabels[detail.level] || detail.level} description={logGuidance(detail.level, detail.context, detailMessage)} />
            <Descriptions
              bordered
              column={1}
              size="small"
              items={[
                { key: 'time', label: '时间（北京）', children: beijingTime(detail.timestamp) },
                { key: 'module', label: '模块', children: `${moduleLabels[detail.context] || detail.context || '—'}${moduleLabels[detail.context] ? `（${detail.context}）` : ''}` },
                { key: 'user', label: '访问用户', children: detail.username || (detail.userId ? `用户 #${detail.userId}` : '—') },
                { key: 'path', label: '接口', children: detail.path ? `${detail.method} ${detail.path}` : '—' },
              ]}
            />
            <Typography.Title level={4} className="logs-detail-heading">完整内容</Typography.Title>
            <pre className="account-detail">{detailMessage}</pre>
            <Button href="/admin/sync/">打开数据同步执行记录</Button>
          </>
        )}
        {detail && tab === 'audit-logs' && (
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
                ...Object.entries(detailFields).filter(([key, value]) => key !== 'requestId' && value !== null && value !== undefined).map(([key, value]) => ({ key: `detail-${key}`, label: detailLabels[key] || key, children: detailText(key, value) })),
              ]}
            />
            {!Object.keys(detailFields).length && <Typography.Paragraph className="logs-muted">这条操作没有附加说明。密码等敏感字段会脱敏，操作记录不提供撤销操作。</Typography.Paragraph>}
          </>
        )}
        {detail && tab !== 'access-logs' && detailId && (
        <div className="logs-related">
          <Typography.Text copyable>{String(detailId)}</Typography.Text>
          <Space wrap>
            <Button onClick={() => related('access-logs', String(detailId), detailTime)}>查看同一请求的接口访问</Button>
            {tab === 'audit-logs' && <Button onClick={() => related('logs', String(detailId), detailTime)}>查看同一请求的系统日志</Button>}
          </Space>
        </div>
        )}
        <Collapse className="logs-raw" items={[{ key: 'raw', label: '技术详情（原始记录）', children: <pre className="account-detail">{JSON.stringify(detail, null, 2)}</pre> }]} />
      </Drawer>
    </>
  );
}
