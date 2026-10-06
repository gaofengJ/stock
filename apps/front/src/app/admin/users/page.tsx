'use client';

import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Form, Input, Modal, Select, Space, Tag, Typography, message,
} from 'antd';
import Table from '@/components/DataTable';
import { api, clearCredential } from '@/auth/client';
import { TeamOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';
import AccountAvatar from '@/auth/AccountAvatar';
import { useAccount } from '@/auth/Boundary';

const fail = (e: unknown) => message.error(errorMessage(e));
export default function Page() {
  const { user, refresh } = useAccount();
  const { runLatestRequest } = useLatestRequest('admin-users');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<number | undefined>();
  const [roleId, setRoleId] = useState<number | undefined>();
  const [activeAdminCount, setActiveAdminCount] = useState(0);
  const [roles, setRoles] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [reset, setReset] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const selectedActive = Form.useWatch('active', form);
  const selectedRoles: number[] | undefined = Form.useWatch('roleIds', form);
  const isAdmin = !!user?.roles.some((r) => r.code === 'admin');
  const lastAdmin = (account: any) => !!account?.active && activeAdminCount === 1 && account.roles.some((r: any) => r.code === 'admin');
  const adminRoleId = roles.find((r) => r.code === 'admin')?.id;
  const retainsManagement = (ids: number[]) => roles.some((r) => ids.includes(r.id) && (r.code === 'admin' || r.permissions.includes('users:manage')));
  const grantable = (role: any) => isAdmin || (role.code !== 'admin' && role.permissions.every((p: string) => user?.permissions.includes(p) && user.catalog.some((c) => c.code === p && c.group !== '管理后台')));
  const manageable = (account: any) => isAdmin || (account.id !== user?.id && account.roles.every((r: any) => {
    const role = roles.find((x) => x.id === r.id);
    return role && grantable(role);
  }));
  const load = useCallback(async () => {
    const q = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      keyword,
    });
    if (active !== undefined) q.set('active', String(active));
    if (roleId !== undefined) q.set('roleId', String(roleId));
    await runLatestRequest({
      request: () => api(`/admin/users?${q}`),
      onStart: () => { setLoading(true); setLoadError(''); },
      onSuccess: (data) => {
        setRows(data.items); setTotal(data.total); setActiveAdminCount(data.activeAdminCount);
        if (data.page !== page) setPage(data.page);
      },
      onError: (e) => setLoadError(errorMessage(e)),
      onFinally: () => setLoading(false),
    });
  }, [page, keyword, active, roleId, runLatestRequest]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    load().catch(fail);
  }, [load]);
  const loadRoles = useCallback(async () => {
    setRolesLoading(true); setRolesError('');
    try { setRoles(await api('/admin/roles')); } catch (e) { setRolesError(errorMessage(e)); } finally { setRolesLoading(false); }
  }, []);
  useEffect(() => { loadRoles(); }, [loadRoles]);
  async function save(
    path: string,
    method: string,
    values: unknown,
    done: () => void,
    afterSave?: () => Promise<void> | void,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      await api(path, method, values);
      done();
      if (afterSave) { await afterSave(); return; }
      await loadRef.current();
      message.success('已保存');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const loginAgain = (reason: string) => {
    clearCredential();
    window.location.replace(`/login/?reason=${reason}`);
  };
  return (
    <>
      <PageHeading title="用户管理" description="管理站点成员、账户状态与角色授权。" icon={<TeamOutlined />} />
      {!isAdmin && <Alert type="info" showIcon message="可管理自身权限范围内的普通账户。自己的账户请使用个人设置；管理账户及管理权限由系统管理员维护。" style={{ marginBottom: 16 }} />}
      <div className="account-toolbar users-filters">
        <Input.Search
          placeholder="搜索用户名或昵称"
          aria-label="搜索用户名或昵称"
          className="users-search"
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!e.target.value) { setKeyword(''); setPage(1); }
          }}
          onSearch={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          allowClear
        />
        <Select
          className="users-select"
          placeholder="账户状态"
          aria-label="账户状态"
          value={active}
          allowClear
          options={[
            { value: 1, label: '已启用' },
            { value: 0, label: '已禁用' },
          ]}
          onChange={(v) => {
            setActive(v);
            setPage(1);
          }}
        />
        <Select
          className="users-select"
          placeholder="角色"
          aria-label="筛选角色"
          value={roleId}
          allowClear
          loading={rolesLoading}
          disabled={rolesLoading || !!rolesError}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          onChange={(v) => { setRoleId(v); setPage(1); }}
        />
        <Button
          disabled={!search && active === undefined && roleId === undefined}
          onClick={() => {
            setSearch(''); setKeyword(''); setActive(undefined); setRoleId(undefined); setPage(1);
          }}
        >
          重置筛选
        </Button>
        <Button
          type="primary"
          onClick={() => {
            createForm.resetFields();
            setCreating(true);
          }}
        >
          创建用户
        </Button>
        <Button loading={loading} onClick={() => { load().catch(fail); loadRoles(); }}>刷新</Button>
      </div>
      {rolesError && <Alert type="error" message={`角色加载失败：${rolesError}`} showIcon action={<Button size="small" onClick={loadRoles}>重试角色</Button>} />}
      {loadError && <Alert type="error" message={loadError} description="当前显示上次成功加载的记录，请重试后再操作。" showIcon action={<Button size="small" onClick={() => load()}>重试</Button>} />}
      <div className="users-summary" aria-live="polite">{loading ? '正在加载用户…' : `共 ${total} 位用户`}</div>
      <Table
        loading={loading}
        autoHeight={rows.length <= 5}
        locale={{ emptyText: loading ? '加载中…' : (loadError || '没有符合条件的记录') }}
        size="middle"
        scroll={{ x: 1160 }}
        rowKey="id"
        dataSource={rows}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
        columns={[
          {
            title: '用户',
            width: 280,
            render: (_, r) => (
              <div className="account-identity">
                <AccountAvatar avatar={r.avatar} roles={r.roles} />
                <div>
                  <div className="users-name">
                    <strong>{r.nickname || r.username}</strong>
                    {r.id === user?.id && <Tag color="processing">当前账号</Tag>}
                  </div>
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
            width: 180,
            render: (_, r) => r.roles.map((x: any) => <Tag key={x.id}>{x.name}</Tag>),
          },
          {
            title: '账户状态',
            width: 110,
            render: (_, r) => (
              <Tag color={r.active ? 'success' : 'error'}>
                {r.active ? '已启用' : '已禁用'}
              </Tag>
            ),
          },
          {
            title: '密码状态',
            width: 130,
            render: (_, r) => (r.mustChangePassword ? <Tag color="warning">需改密</Tag> : '已设置'),
          },
          {
            title: '最近登录（北京时间）',
            width: 230,
            dataIndex: 'lastLogin',
            render: (v) => (v ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '尚未登录'),
          },
          {
            title: '操作',
            width: 230,
            render: (_, r) => (
              <Space>
                <Button
                  size="small"
                  disabled={busy || loading || !!loadError || rolesLoading || !!rolesError || !manageable(r)}
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
                  disabled={busy || loading || !!loadError || rolesLoading || !!rolesError || !manageable(r)}
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
        onCancel={() => { if (!busy) setEditing(null); }}
        cancelButtonProps={{ disabled: busy }}
        onOk={() => form.submit()}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          disabled={busy}
          onFinish={(v) => {
            const own = editing.id === user?.id;
            return save(`/admin/users/${editing.id}`, 'PATCH', v, () => setEditing(null), own ? async () => {
              if (!v.active) { loginAgain('account-disabled'); return; }
              if (!retainsManagement(v.roleIds)) { window.location.replace('/profile/'); return; }
              await refresh(); await loadRef.current(); message.success('已保存');
            } : undefined);
          }}
        >
          {lastAdmin(editing) && <Alert type="info" showIcon message="这是最后一个有效管理员，不能禁用或移除系统管理员角色。" />}
          {editing?.id === user?.id && selectedActive === false && <Alert type="warning" showIcon message="禁用当前账号会立即退出登录；需要其他管理员重新启用后才能登录。" />}
          {editing?.id === user?.id && selectedActive !== false && selectedRoles && !retainsManagement(selectedRoles) && <Alert type="warning" showIcon message="保存后当前账号将失去用户管理权限，并返回个人设置。" />}
          <Form.Item
            name="nickname"
            label="昵称"
            rules={[{ required: true, max: 40 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="active" label="账户状态" rules={[{ validator: async (_, v) => { if (lastAdmin(editing) && !v) throw new Error('至少保留一个有效管理员'); } }]}>
            <Select
              options={[
                { value: true, label: '已启用' },
                { value: false, label: '禁用（立即撤销所有会话）', disabled: lastAdmin(editing) },
              ]}
            />
          </Form.Item>
          <Form.Item name="roleIds" label="角色（可多选）" rules={[{ validator: async (_, v: number[]) => { if (lastAdmin(editing) && !v?.includes(adminRoleId)) throw new Error('最后一个有效管理员必须保留系统管理员角色'); } }]}>
            <Select
              mode="multiple"
              options={roles.filter(grantable).map((r) => ({ value: r.id, label: r.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`重置密码：${reset?.username || ''}`}
        open={!!reset}
        onCancel={() => { if (!busy) setReset(null); }}
        cancelButtonProps={{ disabled: busy }}
        onOk={() => resetForm.submit()}
        confirmLoading={busy}
        destroyOnClose
      >
        <Typography.Paragraph>
          现有会话将全部撤销。用户下次登录必须修改此临时密码。
        </Typography.Paragraph>
        {reset?.id === user?.id && <Alert type="warning" showIcon message="正在重置当前账号的密码。成功后将立即退出，请使用新临时密码重新登录并修改密码。" />}
        <Form
          form={resetForm}
          layout="vertical"
          disabled={busy}
          onFinish={(v) => save(`/admin/users/${reset.id}/reset-password`, 'POST', v, () => {
            resetForm.resetFields();
            setReset(null);
          }, reset.id === user?.id ? () => loginAgain('password-reset') : undefined)}
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
        onCancel={() => { if (!busy) setCreating(false); }}
        cancelButtonProps={{ disabled: busy }}
        onOk={() => createForm.submit()}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          disabled={busy}
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
