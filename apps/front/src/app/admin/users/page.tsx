'use client';

import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Form, Input, Modal, Select, Space, Tag, Typography, message,
} from 'antd';
import Table from '@/components/DataTable';
import { api } from '@/auth/client';
import { TeamOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';
import AccountAvatar from '@/auth/AccountAvatar';

const fail = (e: unknown) => message.error(errorMessage(e));
export default function Page() {
  const { runLatestRequest } = useLatestRequest('admin-users');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [active, setActive] = useState<number | undefined>();
  const [roles, setRoles] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [reset, setReset] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const load = useCallback(async () => {
    const q = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      keyword,
    });
    if (active !== undefined) q.set('active', String(active));
    await runLatestRequest({
      request: () => api(`/admin/users?${q}`),
      onStart: () => { setLoading(true); setLoadError(''); },
      onSuccess: (data) => { setRows(data.items); setTotal(data.total); },
      onError: (e) => setLoadError(errorMessage(e)),
      onFinally: () => setLoading(false),
    });
  }, [page, keyword, active, runLatestRequest]);
  useEffect(() => {
    load().catch(fail);
  }, [load]);
  useEffect(() => {
    api('/admin/roles').then(setRoles).catch(fail);
  }, []);
  async function save(
    path: string,
    method: string,
    values: unknown,
    done: () => void,
  ) {
    setBusy(true);
    try {
      await api(path, method, values);
      done();
      await load();
      message.success('已保存');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="用户管理" description="管理站点成员、账户状态与角色授权。" icon={<TeamOutlined />} />
      <div className="account-toolbar">
        <Input.Search
          placeholder="搜索用户名"
          style={{ width: 260 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          allowClear
        />
        <Select
          style={{ width: 140 }}
          placeholder="账户状态"
          allowClear
          options={[
            { value: 1, label: '正常' },
            { value: 0, label: '已禁用' },
          ]}
          onChange={(v) => {
            setActive(v);
            setPage(1);
          }}
        />
        <Button
          type="primary"
          onClick={() => {
            createForm.resetFields();
            setCreating(true);
          }}
        >
          创建用户
        </Button>
        <Button onClick={() => load().catch(fail)}>刷新</Button>
      </div>
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
          total,
          pageSize: 20,
          onChange: setPage,
          showSizeChanger: false,
        }}
        columns={[
          {
            title: '用户',
            width: 220,
            render: (_, r) => (
              <div className="account-identity">
                <AccountAvatar avatar={r.avatar} roles={r.roles} />
                <div>
                  <strong>{r.nickname || r.username}</strong>
                  <small>
                    @
                    {r.username}
                  </small>
                </div>
              </div>
            ),
          },
          {
            title: '角色',
            render: (_, r) => r.roles.map((x: any) => <Tag key={x.id}>{x.name}</Tag>),
          },
          {
            title: '状态',
            render: (_, r) => (
              <Tag color={r.active ? 'success' : 'error'}>
                {r.active ? '正常' : '已禁用'}
              </Tag>
            ),
          },
          {
            title: '密码',
            render: (_, r) => (r.mustChangePassword ? '待修改' : '正常'),
          },
          {
            title: '最近登录',
            dataIndex: 'lastLogin',
            render: (v) => (v ? new Date(v).toLocaleString() : '尚未登录'),
          },
          {
            title: '操作',
            render: (_, r) => (
              <Space>
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(r);
                    form.setFieldsValue({
                      nickname: r.nickname,
                      active: !!r.active,
                      roleIds: r.roles.map((x: any) => x.id),
                    });
                  }}
                >
                  账户与角色
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setReset(r);
                    resetForm.resetFields();
                  }}
                >
                  重置密码
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={`编辑账户：${editing?.username || ''}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => save(`/admin/users/${editing.id}`, 'PATCH', v, () => setEditing(null))}
        >
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[{ required: true, max: 40 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="active" label="账户状态">
            <Select
              options={[
                { value: true, label: '正常' },
                { value: false, label: '禁用（立即撤销所有会话）' },
              ]}
            />
          </Form.Item>
          <Form.Item name="roleIds" label="角色（可多选）">
            <Select
              mode="multiple"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`重置密码：${reset?.username || ''}`}
        open={!!reset}
        onCancel={() => setReset(null)}
        onOk={() => resetForm.submit()}
        confirmLoading={busy}
        destroyOnClose
      >
        <Typography.Paragraph>
          现有会话将全部撤销。用户下次登录必须修改此临时密码。
        </Typography.Paragraph>
        <Form
          form={resetForm}
          layout="vertical"
          onFinish={(v) => save(`/admin/users/${reset.id}/reset-password`, 'POST', v, () => {
            resetForm.resetFields();
            setReset(null);
          })}
        >
          <Form.Item
            name="password"
            label="临时密码"
            rules={[{ required: true, min: 10, max: 128 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="创建用户"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={() => createForm.submit()}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(v) => save('/admin/users', 'POST', v, () => {
            createForm.resetFields();
            setCreating(false);
          })}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, pattern: /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/ },
            ]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="nickname" label="昵称" rules={[{ max: 40 }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="临时密码"
            rules={[{ required: true, min: 10, max: 128 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
