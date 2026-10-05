'use client';

import { InteractionButton } from '@/components/Interaction';

import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Checkbox, Form, Input, Modal, Popconfirm, Space, Tag, Typography, message,
} from 'antd';
import Table from '@/components/DataTable';
import { useAccount } from '@/auth/Boundary';
import { api, Permission } from '@/auth/client';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';

interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  builtin: boolean;
  permissions: string[];
  users: { id: number; username: string }[];
}
const permissionName = (permission: Permission) => (permission.code === 'news:manage' ? `${permission.name}（全站）` : permission.name);

export default function Page() {
  const { user } = useAccount();
  const isAdmin = !!user?.roles.some((r) => r.code === 'admin');
  const grantable = (code: string) => isAdmin || !!(user?.permissions.includes(code) && user.catalog.some((p) => p.code === code && p.group !== '管理后台'));
  const editable = (role: Role) => role.code !== 'admin' && (isAdmin || (!user?.roles.some((r) => r.id === role.id) && role.permissions.every(grantable)));
  const { runLatestRequest } = useLatestRequest('admin-roles');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rows, setRows] = useState<Role[]>([]);
  const [editing, setEditing] = useState<Partial<Role> | null>(null);
  const [viewing, setViewing] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const fail = (e: unknown) => message.error(errorMessage(e));
  const load = useCallback(() => runLatestRequest({
    request: () => api<Role[]>('/admin/roles'),
    onStart: () => { setLoading(true); setLoadError(''); },
    onSuccess: setRows,
    onError: (e) => setLoadError(errorMessage(e)),
    onFinally: () => setLoading(false),
  }), [runLatestRequest]);
  useEffect(() => {
    load();
  }, [load]);
  const groups = Array.from(new Set(user?.catalog.map((p) => p.group)));
  const viewedPermissions = (viewing?.permissions || []).map((code) => user?.catalog.find((p) => p.code === code) || {
    code, name: code, group: '其他权限', route: '',
  });
  const viewedGroups = Array.from(new Set(viewedPermissions.map((p) => p.group)));
  return (
    <>
      <PageHeading title="角色管理" description="按模块配置权限，让每位成员拥有合适的访问范围。" icon={<SafetyCertificateOutlined />} />
      {!isAdmin && <Alert type="info" showIcon message="只能配置自己已有的业务权限，不能修改自己所属角色。管理权限由系统管理员授予。" style={{ marginBottom: 16 }} />}
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
      {loadError && <Alert type="error" message={loadError} showIcon action={<Button size="small" onClick={() => load()}>重试</Button>} />}
      <Table<Role>
        loading={loading}
        locale={{ emptyText: loading ? '加载中…' : (loadError || '没有符合条件的记录') }}
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
              ? r.users.map((u) => <Tag key={u.id}>{u.username}</Tag>)
              : '暂无'),
          },
          { title: '权限数', render: (_, r) => r.permissions.length },
          {
            title: '操作',
            width: 300,
            render: (_, r) => (
              <Space>
                <InteractionButton intent="preview" onClick={() => setViewing(r)}>查看权限</InteractionButton>
                <Button
                  disabled={!editable(r)}
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
                  <Button danger disabled={!!r.builtin || !!r.users.length || !editable(r)}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={`${viewing?.name || ''} · 权限`}
        width={760}
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={<Button onClick={() => setViewing(null)}>关闭</Button>}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          已授予
          {' '}
          {viewedPermissions.length}
          {' '}
          项权限。
          {viewing?.code === 'admin' ? '系统管理员是内置角色，权限仅供查看。' : ''}
        </Typography.Paragraph>
        {viewedGroups.map((group) => (
          <div key={group} className="account-permission-group">
            <Typography.Text strong>{group}</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                {viewedPermissions.filter((p) => p.group === group).map((p) => <Tag key={p.code} title={p.code}>{permissionName(p)}</Tag>)}
              </Space>
            </div>
          </div>
        ))}
        {!viewedPermissions.length && <Typography.Paragraph type="secondary">未授予权限</Typography.Paragraph>}
        <Typography.Paragraph type="secondary">
          资讯来源管理影响所有用户：启停来源、调整采集间隔、立即采集。个人关注在资讯页面设置。
        </Typography.Paragraph>
      </Modal>
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
                `/admin/roles${editing?.id ? `/${editing.id}` : ''}`,
                editing?.id ? 'PATCH' : 'POST',
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
          {editing?.code === 'user' && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="普通用户角色仅可配置业务查看权限。管理操作请创建独立角色，再到人员管理分配。" />}
          <Typography.Paragraph type="secondary">资讯来源管理影响全站采集，个人关注在资讯页面设置。</Typography.Paragraph>
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
                        <Checkbox key={p.code} value={p.code} disabled={!grantable(p.code) || (editing?.code === 'user' && p.group === '管理后台')}>
                          {permissionName(p)}
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
