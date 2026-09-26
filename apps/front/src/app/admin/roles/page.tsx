'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useAccount } from '@/auth/Boundary';
import { api } from '@/auth/client';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';

export default function Page() {
  const { user } = useAccount();
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const fail = (e: unknown) => message.error((e as Error).message);
  const load = useCallback(
    () => api('/admin/roles')
      .then(setRows)
      .catch((e) => message.error(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  const groups = Array.from(new Set(user?.catalog.map((p) => p.group))).filter(
    (group) => editing?.code !== 'user' || group !== '管理后台',
  );
  return (
    <>
      <PageHeading title="角色管理" description="按模块配置权限，让每位成员拥有合适的访问范围。" icon={<SafetyCertificateOutlined />} />
      <Typography.Paragraph type="secondary">
        一个用户可拥有多个角色，权限取并集。调整后，下次接口请求即生效。
      </Typography.Paragraph>
      <Button
        type="primary"
        style={{ marginBottom: 20 }}
        onClick={() => {
          form.resetFields();
          form.setFieldsValue({ permissions: [] });
          setEditing({});
        }}
      >
        创建角色
      </Button>
      <Table
        size="middle"
        scroll={{ x: 900 }}
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: '角色', dataIndex: 'name' },
          { title: '编码', dataIndex: 'code' },
          { title: '说明', dataIndex: 'description' },
          {
            title: '关联用户',
            render: (_, r) => (r.users.length
              ? r.users.map((u: any) => <Tag key={u.id}>{u.username}</Tag>)
              : '暂无'),
          },
          { title: '权限数', render: (_, r) => r.permissions.length },
          {
            title: '操作',
            render: (_, r) => (
              <Space>
                <Button
                  disabled={r.code === 'admin'}
                  onClick={() => {
                    form.setFieldsValue(r);
                    setEditing(r);
                  }}
                >
                  编辑权限
                </Button>
                <Popconfirm
                  title="确认删除此未使用的角色？"
                  onConfirm={async () => {
                    try {
                      await api(`/admin/roles/${r.id}`, 'DELETE');
                      load();
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  <Button danger disabled={!!r.builtin || !!r.users.length}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing?.id ? '编辑角色' : '创建角色'}
        width={760}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            setBusy(true);
            try {
              await api(
                `/admin/roles${editing.id ? `/${editing.id}` : ''}`,
                editing.id ? 'PATCH' : 'POST',
                v,
              );
              setEditing(null);
              load();
            } catch (e) {
              fail(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, max: 64 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="code"
            label="稳定编码"
            rules={[{ required: true, pattern: /^[a-z][a-z0-9_-]{1,31}$/ }]}
          >
            <Input disabled={!!editing?.builtin} />
          </Form.Item>
          <Form.Item name="description" label="说明" rules={[{ max: 64 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="permissions" label="模块与操作权限">
            <Checkbox.Group style={{ width: '100%' }}>
              {groups.map((group) => (
                <div key={group} className="account-permission-group">
                  <Typography.Text strong>{group}</Typography.Text>
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    {user?.catalog
                      .filter((p) => p.group === group)
                      .map((p) => (
                        <Checkbox key={p.code} value={p.code}>
                          {p.name}
                        </Checkbox>
                      ))}
                  </div>
                </div>
              ))}
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
