'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useAccount } from '@/auth/Boundary';
import { api } from '@/auth/client';

const labels: Record<string, string> = {
  queued: '等待执行',
  running: '执行中',
  success: '数据完整',
  pending: '待补齐',
  failed: '失败',
  interrupted: '已中断',
};
export default function Page() {
  const { user } = useAccount();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) => message.error((e as Error).message);
  const load = useCallback(async () => {
    const r = await api(`/admin/sync-jobs?page=${page}`);
    setRows(r.items);
    setTotal(r.total);
  }, [page]);
  useEffect(() => {
    load().catch(fail);
    const t = setInterval(() => {
      if (!document.hidden) load().catch(fail);
    }, 5000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!selected) return undefined;
    const read = () => api(`/admin/sync-jobs/${selected}`).then(setDetail).catch(fail);
    read();
    const t = setInterval(read, 5000);
    return () => clearInterval(t);
  }, [selected]);
  const submit = async (startDate: string, endDate: string) => {
    setBusy(true);
    try {
      const job = await api('/admin/sync-jobs', 'POST', { startDate, endDate });
      message.success(`任务已提交：${job.id}`);
      setSelected(job.id);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Typography.Title level={3}>数据同步</Typography.Title>
      <Alert
        type="info"
        showIcon
        message="任务在服务器串行执行，可以关闭页面。完成日期表示已执行；是否完整请查看各日期的数据状态。"
        style={{ marginBottom: 20 }}
      />
      {user?.permissions.includes('sync:run') && (
        <Form
          layout="inline"
          style={{ marginBottom: 20 }}
          onFinish={({ dates }) => submit(dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'))}
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
          <Button type="primary" loading={busy} htmlType="submit">
            提交同步任务
          </Button>
        </Form>
      )}
      <Table
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
                      success: 'green',
                      failed: 'red',
                      interrupted: 'red',
                    } as Record<string, string>
                  )[r.status] || 'blue'
                }
              >
                {labels[r.status] || r.status}
              </Tag>
            ),
          },
          { title: '阶段', dataIndex: 'stage' },
          {
            title: '操作',
            render: (_, r) => (
              <Space>
                <Button
                  onClick={() => {
                    setDetail(null);
                    setSelected(r.id);
                  }}
                >
                  详情
                </Button>
                {user?.permissions.includes('sync:run')
                  && ['failed', 'pending', 'interrupted'].includes(r.status) && (
                    <Button
                      loading={busy}
                      onClick={() => submit(r.startDate, r.endDate)}
                    >
                      重新提交
                    </Button>
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
                  children: detail.error || '无',
                },
              ]}
            />
            <Typography.Paragraph type="secondary">
              下表为该日期范围的最新数据状态，可能包含后续任务补齐的结果。
            </Typography.Paragraph>
            <Table
              rowKey={(r) => r.task + r.tradeDate}
              size="small"
              dataSource={detail.dates}
              columns={[
                { title: '日期', dataIndex: 'tradeDate' },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (v) => labels[v] || v,
                },
                { title: '行情条数', dataIndex: 'dailyCount' },
                { title: '涨跌停条数', dataIndex: 'limitCount' },
                { title: '情绪条数', dataIndex: 'sentiCount' },
                { title: '说明', dataIndex: 'error' },
              ]}
            />
          </>
        )}
      </Drawer>
    </>
  );
}
