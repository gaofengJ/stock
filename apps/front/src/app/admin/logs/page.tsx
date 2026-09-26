'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Form,
  Input,
  Select,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { api } from '@/auth/client';
import { FileSearchOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';

export default function Page() {
  const [tab, setTab] = useState('logs');
  const [query, setQuery] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>({ items: [] });
  const [stats, setStats] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        ...query,
        page: String(page),
        pageSize: '20',
      });
      setData(await api(`/admin/${tab}?${q}`));
      setStats(
        await api(
          `/admin/stats?${new URLSearchParams({
            startDate: query.startDate || dayjs().format('YYYY-MM-DD'),
            endDate: query.endDate || dayjs().format('YYYY-MM-DD'),
          })}`,
        ),
      );
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, query, page]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <PageHeading title="日志分析" description="检索应用日志与操作记录，了解系统运行情况。" icon={<FileSearchOutlined />} />
      <Alert
        type="info"
        showIcon
        message={`默认查询当天，每次最多 7 天。应用日志保留 ${
          stats?.retentionDays || '配置指定'
        } 天；操作审计保留 90 天。`}
        style={{ marginBottom: 20 }}
      />
      <Form
        key={tab}
        className="account-toolbar"
        layout="inline"
        style={{ marginBottom: 16, gap: 8 }}
        onFinish={(v) => {
          const q: Record<string, string> = {};
          ['keyword', 'level', 'module', 'user', 'action', 'result'].forEach(
            (key) => {
              if (v[key]) q[key] = v[key];
            },
          );
          if (v.dates) {
            q.startDate = v.dates[0].format('YYYY-MM-DD');
            q.endDate = v.dates[1].format('YYYY-MM-DD');
          }
          setQuery(q);
          setPage(1);
        }}
      >
        <Form.Item name="dates">
          <DatePicker.RangePicker />
        </Form.Item>
        <Form.Item name="keyword">
          <Input placeholder="关键词" />
        </Form.Item>
        {tab === 'logs' ? (
          <>
            <Form.Item name="level">
              <Select
                style={{ width: 110 }}
                allowClear
                placeholder="级别"
                options={['error', 'warn', 'info', 'debug', 'verbose'].map(
                  (v) => ({ value: v, label: v }),
                )}
              />
            </Form.Item>
            <Form.Item name="module">
              <Input placeholder="模块" />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item name="user">
              <Input placeholder="用户" />
            </Form.Item>
            <Form.Item name="action">
              <Input placeholder="操作" />
            </Form.Item>
            <Form.Item name="result">
              <Input placeholder="结果" />
            </Form.Item>
          </>
        )}
        <Button htmlType="submit" type="primary">
          查询
        </Button>
        <Button onClick={load}>刷新</Button>
      </Form>
      {stats && (
        <div className="account-stats">
          <Card size="small" title="日志级别分布">
            {Object.entries(stats.levels).map(([k, v]) => (
              <div key={k} className="account-stat-line">
                <span>{k}</span>
                <strong>{String(v)}</strong>
              </div>
            ))}
          </Card>
          <Card size="small" title="每日错误趋势">
            {Object.keys(stats.trend).length
              ? Object.entries(stats.trend).map(([k, v]) => (
                <div key={k} className="account-stat-line">
                  <span>{k}</span>
                  <strong>{String(v)}</strong>
                </div>
              ))
              : '暂无错误'}
          </Card>
          <Card size="small" title="同步任务统计">
            {stats.sync.length
              ? stats.sync.map((r: any) => (
                <div key={`${r.source}:${r.status}`} className="account-stat-line">
                  <span>
                    {r.source === 'scheduled' ? '定时 · ' : '人工 · '}
                    {({
                      success: '成功', pending: '待补齐', failed: '失败', interrupted: '中断', running: '执行中', queued: '排队中',
                    } as Record<string, string>)[r.status] || r.status}
                  </span>
                  <strong>{r.count}</strong>
                </div>
              ))
              : '暂无任务'}
          </Card>
        </div>
      )}
      <Typography.Paragraph type="secondary">
        所选范围内可用应用日志：
        {stats?.availableDates?.join('、') || '无'}
        {data.malformed ? `；已跳过坏日志行：${data.malformed}` : ''}
      </Typography.Paragraph>
      {(data.truncated || stats?.truncated) && (
        <Alert
          type="warning"
          message="日志超过单次 128 MB 扫描上限，当前列表与统计为部分结果，请缩小日期范围。"
        />
      )}
      <Tabs
        activeKey={tab}
        onChange={(v) => {
          setData({ items: [] });
          setQuery({});
          setTab(v);
          setPage(1);
        }}
        items={[
          { key: 'logs', label: '应用日志' },
          { key: 'audit-logs', label: '操作审计' },
        ]}
      />
      <Table
        loading={loading}
        size="middle"
        scroll={{ x: 900 }}
        rowKey="id"
        dataSource={data.items}
        pagination={{
          current: page,
          pageSize: 20,
          total: data.total,
          onChange: setPage,
          showSizeChanger: false,
        }}
        columns={
          tab === 'logs'
            ? [
              { title: '时间', dataIndex: 'timestamp' },
              { title: '级别', dataIndex: 'level' },
              { title: '模块', dataIndex: 'context' },
              {
                title: '内容',
                dataIndex: 'message',
                ellipsis: true,
                render: (v) => (typeof v === 'string' ? v : JSON.stringify(v)),
              },
              {
                title: '详情',
                render: (_, r) => (
                  <Button onClick={() => setDetail(r)}>查看</Button>
                ),
              },
            ]
            : [
              { title: '时间', dataIndex: 'createdAt', render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '—') },
              { title: '用户', dataIndex: 'actorName' },
              { title: '操作', dataIndex: 'action' },
              { title: '目标', dataIndex: 'target' },
              { title: '结果', dataIndex: 'result' },
              {
                title: '详情',
                render: (_, r) => (
                  <Button onClick={() => setDetail(r)}>查看</Button>
                ),
              },
            ]
        }
      />
      <Drawer
        title="日志详情"
        width={760}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        <pre className="account-detail">
          {JSON.stringify(detail, null, 2)}
        </pre>
      </Drawer>
    </>
  );
}
