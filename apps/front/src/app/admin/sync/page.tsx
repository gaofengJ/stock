'use client';

import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, DatePicker, Descriptions, Drawer, Dropdown, Form, Input, Modal, Select, Space, Tag, Tooltip, Typography, message,
} from 'antd';
import type { Dayjs } from 'dayjs';
import Table from '@/components/DataTable';
import { useAccount } from '@/auth/Boundary';
import { api } from '@/auth/client';
import { SyncOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';
import { startJobPolling } from './job-polling';

const labels: Record<string, string> = {
  queued: '等待排队',
  running: '执行中',
  success: '校验完成',
  pending: '等待重试',
  failed: '失败',
  interrupted: '已中断',
  paused: '已暂停',
  pausing: '正在暂停',
  cancelled: '已取消',
  cancelling: '正在取消',
};
const modes = [
  { value: 'missing', label: '行情缺失补齐', description: '校验日期范围内的行情，只补齐缺失数据。已有完整数据会跳过。' },
  { value: 'refresh', label: '行情重新采集并计算', description: '重新采集行情并计算相关指标，会更新已有数据，通常比补缺失耗时更长。' },
  { value: 'breadth', label: '均线广度补齐', description: '校验并补齐均线广度数据，依赖对应交易日的基础行情。' },
  { value: 'sector', label: '同花顺板块与成分', description: '同步同花顺板块目录、成分及日期范围内的板块日线。' },
  { value: 'technical', label: '策略复权行情', description: '校验并补齐策略需要的复权行情。' },
  { value: 'insights', label: '市场与策略观察', description: '校验并补齐市场和策略观察统计，依赖基础行情。' },
  { value: 'hot', label: '同花顺日终人气', description: '校验并补齐同花顺日终人气数据。' },
];
const modeLabel = (mode: string) => modes.find((m) => m.value === mode)?.label || mode || '行情缺失补齐';
const formatTime = (value?: string) => (value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—');
const rangeError = (dates?: (Dayjs | null)[] | null) => {
  if (!dates?.[0] || !dates[1]) return '请选择完整的起止日期，同一天表示按日同步';
  if (dates[0].format('YYYY-MM-DD') > dates[1].format('YYYY-MM-DD')) return '开始日期不能晚于结束日期';
  if (dates[0].format('YYYY-MM-DD') < dates[1].subtract(2, 'year').format('YYYY-MM-DD')) return '同步日期跨度不能超过两个自然年';
  return '';
};
interface Job {
  id: number; mode: string; actorId: number | null; actorName: string; startDate: string; endDate: string;
  status: string; stage: string; retryCount: number; nextRetryAt?: string; lastProgressAt?: string;
  startedAt?: string; finishedAt?: string; createdAt?: string; error?: string;
}
interface Query { keyword?: string; status?: string; mode?: string; startDate?: string; endDate?: string }
interface JobList { items: Job[]; total: number; page?: number; summary?: Record<string, number>; maxFailures?: number }
const progressText = (job: Pick<Job, 'status' | 'stage'>) => (job.status === 'success' && /^已处理 0 日，待补 0 日$/.test(job.stage) ? '校验完成，本次无需补齐' : job.stage || '等待调度');
const errorSummary = (value: string) => {
  const text = errorMessage(value, '同步异常，请查看详情');
  return text.length > 160 ? `${text.slice(0, 160)}…（详情查看完整原因）` : text;
};
const elapsed = (job: Job, now: number) => {
  if (!job.startedAt) return '尚未开始';
  const seconds = Math.max(0, Math.floor(((job.finishedAt ? Date.parse(job.finishedAt) : now) - Date.parse(job.startedAt)) / 1000));
  if (!Number.isFinite(seconds)) return '—';
  const duration = seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  return `${job.finishedAt ? '总历时' : '已历时'} ${duration}（含等待）`;
};

export default function Page() {
  const { user } = useAccount();
  const canRun = !!user?.permissions.includes('sync:run');
  const { runLatestRequest } = useLatestRequest('admin-sync');
  const [form] = Form.useForm();
  const selectedMode = Form.useWatch('mode', form) || 'missing';
  const [modal, contextHolder] = Modal.useModal();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requests = useRef(0);
  const mutation = useRef(false);
  const [loadError, setLoadError] = useState('');
  const [rows, setRows] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [maxFailures, setMaxFailures] = useState(5);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [query, setQuery] = useState<Query>({});
  const [search, setSearch] = useState('');
  const [dates, setDates] = useState<[Dayjs, Dayjs] | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState<{ id: number; action: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fail = (e: unknown) => message.error(errorMessage(e));
  const load = useCallback(async (silent = false) => {
    requests.current += 1;
    try {
      await runLatestRequest({
        request: () => {
          const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
          Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
          return api<JobList>(`/admin/sync-jobs?${params}`);
        },
        onStart: () => { if (!silent) { setLoading(true); setRefreshing(true); } },
        onSuccess: (r) => {
          setRows(r.items); setTotal(r.total); setSummary(r.summary || null); setMaxFailures(r.maxFailures || 5);
          setLoadError(''); setUpdatedAt(Date.now());
          if (r.page && r.page !== page) setPage(r.page);
        },
        onError: (e) => setLoadError(errorMessage(e)),
        onFinally: () => { setLoading(false); setRefreshing(false); },
      });
    } finally { requests.current -= 1; }
  }, [query, page, pageSize, runLatestRequest]);
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden && requests.current === 0) load(true); }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!selected) return undefined;
    setDetail(null); setDetailError('');
    return startJobPolling({
      read: () => api(`/admin/sync-jobs/${selected}`),
      onValue: (value) => { setDetail(value); setDetailError(''); },
      onError: (error) => setDetailError(errorMessage(error)),
      visible: () => !document.hidden,
    });
  }, [selected, detailVersion]);
  const filter = (values: Partial<Query>) => { setQuery((q) => ({ ...q, ...values })); setPage(1); };
  const submit = async ({ syncDates, mode }: { syncDates: [Dayjs, Dayjs]; mode: string }) => {
    if (mutation.current) return;
    mutation.current = true; setSubmitting(true);
    try {
      const job = await api('/admin/sync-jobs', 'POST', { startDate: syncDates[0].format('YYYY-MM-DD'), endDate: syncDates[1].format('YYYY-MM-DD'), mode });
      message.success(`任务 #${job.id}：${labels[job.status] || job.status}，服务器将串行执行`);
      setSelected(job.id); setDetailVersion((v) => v + 1); await load(true);
    } catch (e) { fail(e); } finally { mutation.current = false; setSubmitting(false); }
  };
  const control = async (id: number, action: 'pause' | 'cancel' | 'retry') => {
    if (mutation.current) return;
    mutation.current = true; setBusy({ id, action });
    try {
      const job = await api(`/admin/sync-jobs/${id}/control`, 'POST', { action });
      message.success(action === 'retry' ? `任务 #${id} 已重新排队，失败计数已清零` : `任务 #${id}：${labels[job.status]}`);
      if (selected === id) setDetailVersion((v) => v + 1);
    } catch (e) { fail(e); } finally { await load(true); mutation.current = false; setBusy(null); }
  };
  const openDetail = (id: number) => { setSelected(id); setDetailVersion((v) => v + 1); };
  const filtered = Object.values(query).some(Boolean);
  const allCount = summary ? Object.values(summary).reduce((sum, n) => sum + n, 0) : null;
  const operationsDisabled = !!busy || submitting || loading || !!loadError;
  return (
    <>
      {contextHolder}
      <PageHeading title="数据同步" description="校验数据完整性，跟踪同步进度，处理失败与重试任务。" icon={<SyncOutlined />} />
      <Alert type="info" showIcon message={`任务在服务器串行执行，可以关闭页面。暂停和取消在当前批次结束后生效；累计失败 ${maxFailures} 次后停止自动重试。`} />
      <div className="sync-overview" aria-label="全部任务状态概览">
        {[['', '全部任务'], ['queued', '等待排队'], ['running', '执行中'], ['pending', '等待重试'], ['failed', '失败'], ['success', '校验完成']].map(([status, title]) => (
          <Button key={status} className={`sync-overview-item${status === 'failed' ? ' sync-overview-danger' : ''}`} aria-pressed={(query.status || '') === status} onClick={() => filter({ status: status || undefined })}>
            <strong>{status ? summary?.[status] ?? (summary ? 0 : '—') : allCount ?? '—'}</strong>
            <span>{title}</span>
          </Button>
        ))}
      </div>
      <Typography.Paragraph type="secondary">概览统计全部任务；点击状态会筛选列表，并保留其他筛选条件。</Typography.Paragraph>
      {canRun && (
        <Form
          form={form}
          className="account-toolbar sync-submit"
          layout="inline"
          initialValues={{ mode: 'missing' }}
          disabled={submitting || !!busy}
          onFinish={submit}
          onKeyDown={(event) => {
            // Enter confirms a typed date; it must not also submit a sync task.
            if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.closest('.ant-picker')) event.preventDefault();
          }}
        >
          <Form.Item name="syncDates" label="同步日期" rules={[{ validator: async (_, value) => { const error = rangeError(value); if (error) throw new Error(error); } }]}>
            <DatePicker.RangePicker allowClear />
          </Form.Item>
          <Form.Item name="mode" label="同步方式"><Select className="sync-mode" options={modes} /></Form.Item>
          <Button type="primary" loading={submitting} disabled={!!busy} htmlType="submit">提交同步任务</Button>
          <div className="sync-submit-help">
            <strong>{modes.find((m) => m.value === selectedMode)?.description}</strong>
            <span>同步跨度最多两个自然年；选择同一天可按日同步。</span>
          </div>
        </Form>
      )}
      <div className="account-toolbar sync-filters" aria-label="任务筛选">
        <Input.Search className="sync-search" placeholder="搜索任务编号或触发人" aria-label="搜索任务编号或触发人" maxLength={100} value={search} allowClear onChange={(e) => { setSearch(e.target.value); if (!e.target.value) filter({ keyword: undefined }); }} onSearch={(v) => filter({ keyword: v.trim() || undefined })} />
        <Select className="sync-filter-select" aria-label="任务状态" placeholder="全部状态" value={query.status} allowClear options={Object.entries(labels).map(([value, label]) => ({ value, label }))} onChange={(status) => filter({ status })} />
        <Select className="sync-mode" aria-label="任务类型" placeholder="全部任务类型" value={query.mode} allowClear options={modes} onChange={(mode) => filter({ mode })} />
        <DatePicker.RangePicker
          aria-label="任务日期范围"
          value={dates}
          placeholder={['任务开始日期', '任务结束日期']}
          onChange={(value) => {
            const range = value?.[0] && value[1] ? value as [Dayjs, Dayjs] : null;
            setDates(range); filter({ startDate: range?.[0].format('YYYY-MM-DD'), endDate: range?.[1].format('YYYY-MM-DD') });
          }}
        />
        <Button disabled={!filtered && !search} onClick={() => { setQuery({}); setSearch(''); setDates(null); setPage(1); }}>重置筛选</Button>
        <Button loading={refreshing} onClick={() => load()}>刷新</Button>
      </div>
      <div className="sync-list-summary" aria-live="polite">
        <span>
          {filtered ? '筛选结果' : '全部记录'}
          {' '}
          {total}
          {' '}
          条
        </span>
        <span>
          任务日期按同步范围交集筛选 · 时间均为北京时间 ·
          {updatedAt ? `最近更新 ${formatTime(new Date(updatedAt).toISOString())}` : '尚未更新'}
          {' '}
          · 每 5 秒自动更新
        </span>
      </div>
      {loadError && <Alert type="error" message={loadError} description="当前记录可能不是最新状态，请重试后再执行任务操作。" showIcon action={<Button size="small" onClick={() => load()}>重试</Button>} />}
      <Table<Job>
        loading={loading}
        size="middle"
        scroll={{ x: 1600 }}
        autoHeight={rows.length <= 5}
        rowKey="id"
        dataSource={rows}
        rowClassName={(r) => (['failed', 'interrupted'].includes(r.status) || (r.status === 'pending' && r.retryCount >= maxFailures - 1) ? 'sync-job-warning' : '')}
        locale={{ emptyText: loadError || '没有符合条件的同步任务' }}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], hideOnSinglePage: true, showTotal: (n) => `共 ${n} 条`, onChange: (next, size) => { setPage(size === pageSize ? next : 1); setPageSize(size); },
        }}
        columns={[
          {
            title: '任务',
            width: 210,
            render: (_, r) => (
              <div className="sync-job-cell">
                <strong>{modeLabel(r.mode)}</strong>
                <small>
                  #
                  {r.id}
                </small>
              </div>
            ),
          },
          { title: '触发人', width: 110, render: (_, r) => (r.actorId === null ? <Tag>系统自动</Tag> : `@${r.actorName}`) },
          {
            title: '同步日期范围', width: 210, className: 'admin-cell-nowrap', render: (_, r) => `${r.startDate} 至 ${r.endDate}`,
          },
          {
            title: '状态',
            width: 105,
            render: (_, r) => (
              <Tag color={({
                success: 'success', failed: 'error', interrupted: 'error', pending: r.retryCount >= maxFailures - 1 ? 'warning' : 'processing',
              } as Record<string, string>)[r.status]}
              >
                {labels[r.status] || r.status}
              </Tag>
            ),
          },
          {
            title: '进度与异常',
            render: (_, r) => (
              <div className="sync-job-cell">
                <span>{progressText(r)}</span>
                {r.error && <span className="sync-job-error">{errorSummary(r.error)}</span>}
                {r.status === 'pending' && r.retryCount >= maxFailures - 1 && <strong className="sync-job-error">接近失败上限，再失败一次将停止自动重试</strong>}
                {r.status === 'failed' && <span className="sync-job-error">自动重试已停止，请检查原因后重新排队</span>}
              </div>
            ),
          },
          {
            title: '失败次数',
            width: 90,
            render: (_, r) => (
              <Tag color={r.retryCount >= maxFailures - 1 ? 'error' : undefined}>
                {r.retryCount}
                {' '}
                /
                {' '}
                {maxFailures}
              </Tag>
            ),
          },
          {
            title: '下次重试（北京）',
            width: 180,
            className: 'admin-cell-nowrap',
            render: (_, r) => (
              <div className="sync-job-cell">
                <span>{formatTime(r.nextRetryAt)}</span>
                {r.status === 'pending' && r.nextRetryAt && Date.parse(r.nextRetryAt) <= updatedAt && <small>已到重试时间，等待调度</small>}
              </div>
            ),
          },
          {
            title: '任务时间（北京）',
            width: 220,
            render: (_, r) => (
              <div className="sync-job-cell">
                <span>{`创建 ${formatTime(r.createdAt)}`}</span>
                <small>{r.finishedAt ? `完成 ${formatTime(r.finishedAt)}` : `最近进展 ${formatTime(r.lastProgressAt)}`}</small>
                <small>{elapsed(r, updatedAt)}</small>
              </div>
            ),
          },
          {
            title: '操作',
            width: 210,
            render: (_, r) => (
              <Space size={4} wrap>
                <Button type="text" size="small" onClick={() => openDetail(r.id)}>详情</Button>
                {canRun && ['failed', 'pending', 'interrupted', 'paused'].includes(r.status) && (
                  <Tooltip title={r.status === 'paused' ? '继续进入执行队列，已保存的数据会保留，失败计数清零。' : '重新进入执行队列，失败计数清零。任务按服务器调度执行。'}>
                    <Button type="primary" size="small" disabled={operationsDisabled} loading={busy?.id === r.id && busy.action === 'retry'} onClick={() => control(r.id, 'retry')}>{r.status === 'paused' ? '继续排队' : '重新排队'}</Button>
                  </Tooltip>
                )}
                {canRun && ['queued', 'pending', 'running', 'paused', 'pausing'].includes(r.status) && (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        ...(['queued', 'pending', 'running'].includes(r.status) ? [{ key: 'pause', label: '暂停任务' }] : []),
                        { key: 'cancel', label: '取消任务', danger: true },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'pause') control(r.id, 'pause');
                        else {
                          modal.confirm({
                            title: `取消任务 #${r.id}？`, content: '已保存的数据会保留；正在执行的任务将在当前批次结束后停止。', okText: '取消任务', okButtonProps: { danger: true }, cancelText: '保留任务', onOk: () => control(r.id, 'cancel'),
                          });
                        }
                      },
                    }}
                  >
                    <Button size="small" disabled={operationsDisabled} loading={busy?.id === r.id && busy.action !== 'retry'} aria-label={`任务 #${r.id} 更多操作`}>更多</Button>
                  </Dropdown>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Drawer
        title={`同步任务 #${selected}`}
        width={860}
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setDetail(null);
        }}
      >
        {detailError && <Alert type="error" message={detailError} showIcon action={<Button size="small" onClick={() => setDetailVersion((v) => v + 1)}>重试</Button>} />}
        {!detail && !detailError && <Typography.Paragraph>加载中…</Typography.Paragraph>}
        {detail && (
          <>
            <Descriptions
              column={1}
              items={[
                { key: 'mode', label: '任务类型', children: modeLabel(detail.mode) },
                { key: 'actor', label: '触发人', children: detail.actor_id === null ? '系统自动' : `@${detail.actor_name}` },
                { key: 'range', label: '同步日期范围', children: `${detail.startDate} 至 ${detail.endDate}` },
                { key: 'created', label: '创建时间（北京）', children: formatTime(detail.created_at) },
                { key: 'started', label: '开始时间（北京）', children: formatTime(detail.started_at) },
                { key: 'finished', label: '完成时间（北京）', children: formatTime(detail.finished_at) },
                {
                  key: 'state',
                  label: '状态',
                  children: labels[detail.status],
                },
                { key: 'stage', label: '进度', children: progressText(detail) },
                { key: 'failures', label: '失败次数', children: `${detail.retry_count || 0} / ${detail.maxFailures}` },
                { key: 'retry', label: '下次重试（北京）', children: formatTime(detail.next_retry_at) },
                { key: 'progress', label: '最近进展（北京）', children: detail.last_progress_at ? formatTime(detail.last_progress_at) : '尚无完成记录' },
                {
                  key: 'dates',
                  label: '实际执行日期',
                  children:
                    (typeof detail.completed_dates === 'string'
                      ? JSON.parse(detail.completed_dates)
                      : detail.completed_dates || []
                    ).join('、') || '尚无',
                },
                {
                  key: 'error',
                  label: '错误摘要',
                  children: detail.error ? errorMessage(detail.error, '同步失败，请查看服务日志') : '无',
                },
              ]}
            />
            <Typography.Paragraph type="secondary">
              下表为该日期范围的最新数据状态，可能包含后续任务补齐的结果。
            </Typography.Paragraph>
            <Table
              rowKey={(r: { task: string; tradeDate: string }) => r.task + r.tradeDate}
              size="small"
              dataSource={detail.dates}
              columns={[
                { title: '日期', dataIndex: 'tradeDate' },
                {
                  title: '阶段',
                  dataIndex: 'task',
                  render: (v) => ({
                    daily: '个股行情', 'market-index': '指数日线', market: '市场汇总', 'market-breadth': '均线广度', 'ths-catalog': '同花顺目录', 'ths-daily': '同花顺板块行情', 'strategy-factor': '策略复权行情', 'stock-insight': '市场与策略观察', 'ths-hot': '同花顺日终人气',
                  }[v as string] || v),
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (v) => labels[v] || v,
                },
                { title: '行情条数', dataIndex: 'dailyCount' },
                { title: '涨跌停条数', dataIndex: 'limitCount' },
                { title: '情绪条数', dataIndex: 'sentiCount' },
                { title: '说明', dataIndex: 'error', render: (v) => (v ? errorMessage(v, '同步失败，请查看服务日志') : '—') },
              ]}
            />
          </>
        )}
      </Drawer>
    </>
  );
}
