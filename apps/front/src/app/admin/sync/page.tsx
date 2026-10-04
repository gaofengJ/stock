'use client';

import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, DatePicker, Descriptions, Drawer, Form, Popconfirm, Select, Space, Tag, Typography, message,
} from 'antd';
import Table from '@/components/DataTable';
import { useAccount } from '@/auth/Boundary';
import { api } from '@/auth/client';
import { SyncOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';
import { startJobPolling } from './job-polling';

const labels: Record<string, string> = {
  queued: '等待执行',
  running: '执行中',
  success: '数据完整',
  pending: '待补齐',
  failed: '失败',
  interrupted: '已中断',
  paused: '已暂停',
  pausing: '正在暂停',
  cancelled: '已取消',
  cancelling: '正在取消',
};
export default function Page() {
  const { user } = useAccount();
  const { runLatestRequest } = useLatestRequest('admin-sync');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => message.error(errorMessage(e));
  const load = useCallback(async () => {
    await runLatestRequest({
      request: () => api(`/admin/sync-jobs?page=${page}`),
      onStart: () => { setLoading(true); setLoadError(''); },
      onSuccess: (r) => { setRows(r.items); setTotal(r.total); },
      onError: (e) => setLoadError(errorMessage(e)),
      onFinally: () => setLoading(false),
    });
  }, [page, runLatestRequest]);
  useEffect(() => {
    load().catch(fail);
    const t = setInterval(() => {
      if (!document.hidden) load().catch(fail);
    }, 5000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!selected) return undefined;
    setDetail(null);
    setDetailError('');
    return startJobPolling({
      read: () => api(`/admin/sync-jobs/${selected}`),
      onValue: (value) => { setDetail(value); setDetailError(''); },
      onError: (error) => setDetailError(errorMessage(error)),
      visible: () => !document.hidden,
    });
  }, [selected, detailVersion]);
  const submit = async (startDate: string, endDate: string, mode = 'missing') => {
    setBusy(true);
    try {
      const job = await api('/admin/sync-jobs', 'POST', { startDate, endDate, mode });
      message.success(`任务 #${job.id}：${labels[job.status] || job.status}`);
      setDetail(null);
      setSelected(job.id);
      setDetailVersion((v) => v + 1);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const control = async (id: number, action: 'pause' | 'cancel' | 'retry') => {
    setBusy(true);
    try {
      const job = await api(`/admin/sync-jobs/${id}/control`, 'POST', { action });
      message.success(`任务 #${id}：${labels[job.status]}`);
      setDetailVersion((v) => v + 1);
      await load();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeading title="数据同步" description="按日更新行情，或补齐指定日期范围的数据。" icon={<SyncOutlined />} />
      <Alert
        type="info"
        showIcon
        message="任务在服务器串行执行，可以关闭页面。暂停和取消在当前批次结束后生效；累计失败 5 次后停止自动重试，可手动重试。"
        style={{ marginBottom: 20 }}
      />
      {user?.permissions.includes('sync:run') && (
        <Form
          className="account-toolbar"
          layout="inline"
          style={{ marginBottom: 20 }}
          initialValues={{ mode: 'missing' }}
          onFinish={({ dates, mode }) => submit(dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'), mode)}
        >
          <Form.Item
            name="dates"
            label="同步日期"
            rules={[
              { required: true, message: '请选择起止日期，同一天表示按日同步' },
            ]}
          >
            <DatePicker.RangePicker allowClear />
          </Form.Item>
          <Form.Item name="mode" label="方式"><Select style={{ width: 180 }} options={[{ value: 'missing', label: '仅补缺失数据' }, { value: 'refresh', label: '重新采集并计算' }, { value: 'breadth', label: '仅补均线广度' }, { value: 'sector', label: '同花顺板块与成分' }, { value: 'technical', label: '策略复权行情' }, { value: 'insights', label: '市场与策略观察' }, { value: 'hot', label: '同花顺日终人气' }]} /></Form.Item>
          <Button type="primary" loading={busy} htmlType="submit">
            提交同步任务
          </Button>
        </Form>
      )}
      {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={() => load()}>重试</Button>} />}
      <Table
        loading={loading}
        locale={{ emptyText: loading ? '加载中…' : (loadError || '没有符合条件的记录') }}
        size="middle"
        scroll={{ x: 900 }}
        rowKey="id"
        dataSource={rows}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          onChange: setPage,
          showSizeChanger: false,
        }}
        columns={[
          { title: '任务', dataIndex: 'id' },
          { title: '执行人', dataIndex: 'actorName' },
          {
            title: '日期范围',
            render: (_, r) => `${r.startDate} 至 ${r.endDate}`,
          },
          {
            title: '状态',
            render: (_, r) => (
              <Tag
                color={
                  (
                    {
                      success: 'success',
                      failed: 'error',
                      interrupted: 'error',
                    } as Record<string, string>
                  )[r.status] || 'processing'
                }
              >
                {labels[r.status] || r.status}
              </Tag>
            ),
          },
          { title: '阶段', dataIndex: 'stage' },
          { title: '失败次数', dataIndex: 'retryCount' },
          { title: '下次重试', dataIndex: 'nextRetryAt', render: (v) => (v ? new Date(v).toLocaleString() : '—') },
          {
            title: '操作',
            render: (_, r) => (
              <Space>
                <Button
                  onClick={() => {
                    setDetail(null);
                    setSelected(r.id);
                    setDetailVersion((v) => v + 1);
                  }}
                >
                  详情
                </Button>
                {user?.permissions.includes('sync:run')
                  && ['failed', 'pending', 'interrupted', 'paused'].includes(r.status) && (
                    <Button
                      loading={busy}
                      onClick={() => control(r.id, 'retry')}
                    >
                      {r.status === 'paused' ? '继续执行' : '立即重试'}
                    </Button>
                )}
                {user?.permissions.includes('sync:run') && ['queued', 'pending', 'running'].includes(r.status) && (
                  <Button disabled={busy} onClick={() => control(r.id, 'pause')}>暂停</Button>
                )}
                {user?.permissions.includes('sync:run') && ['queued', 'pending', 'running', 'paused', 'pausing'].includes(r.status) && (
                  <Popconfirm title="取消此任务？已保存的数据会保留。" onConfirm={() => control(r.id, 'cancel')}>
                    <Button danger disabled={busy}>取消</Button>
                  </Popconfirm>
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
        {detailError && <Alert type="error" message={detailError} showIcon />}
        {!detail && !detailError && <Typography.Paragraph>加载中…</Typography.Paragraph>}
        {detail && (
          <>
            <Descriptions
              column={1}
              items={[
                {
                  key: 'state',
                  label: '状态',
                  children: labels[detail.status],
                },
                { key: 'stage', label: '阶段', children: detail.stage },
                { key: 'failures', label: '失败次数', children: `${detail.retry_count || 0} / ${detail.maxFailures}` },
                { key: 'retry', label: '下次重试', children: detail.next_retry_at ? new Date(detail.next_retry_at).toLocaleString() : '—' },
                { key: 'progress', label: '最近进展', children: detail.last_progress_at ? new Date(detail.last_progress_at).toLocaleString() : '尚无完成记录' },
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
