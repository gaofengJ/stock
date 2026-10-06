'use client';

import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Tag, Tooltip, Typography, message,
} from 'antd';
import Link from 'next/link';
import Table from '@/components/DataTable';
import { useAccount } from '@/auth/Boundary';
import { api, Permission } from '@/auth/client';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import PageHeading from '@/auth/PageHeading';
import AccountAvatar from '@/auth/AccountAvatar';

interface Member { id: number; username: string; nickname: string; avatar?: string; active: boolean }
interface Role {
  id: number; code: string; name: string; description: string; builtin: boolean;
  permissions: string[]; users: Member[]; revision: string;
}
interface Values { name: string; code: string; description?: string; permissions: string[] }
const permissionName = (permission: Permission) => (permission.code === 'news:manage' ? `${permission.name}（全站）` : permission.name);
const valuesOf = (role: Role): Values => ({
  name: role.name, code: role.code, description: role.description, permissions: [...role.permissions],
});

export default function Page() {
  const { user, refresh } = useAccount();
  const isAdmin = !!user?.roles.some((r) => r.code === 'admin');
  const managesUsers = !!user?.permissions.includes('users:manage');
  const grantable = (code: string) => isAdmin || !!(user?.permissions.includes(code) && user.catalog.some((p) => p.code === code && p.group !== '管理后台'));
  const editReason = (role: Role) => {
    if (role.code === 'admin') return '系统管理员角色仅供查看，不能编辑权限';
    if (!isAdmin && user?.roles.some((r) => r.id === role.id)) return '不能修改自己所属角色的权限';
    if (!isAdmin && !role.permissions.every(grantable)) return '此角色包含超出你授权范围的权限';
    return '';
  };
  const deleteReason = (role: Role) => {
    if (role.builtin) return '系统内置角色不能删除';
    if (role.users.length) return `仍关联 ${role.users.length} 位用户，请先在用户管理中解除关联`;
    return editReason(role);
  };
  const { runLatestRequest } = useLatestRequest('admin-roles');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rows, setRows] = useState<Role[]>([]);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [builtin, setBuiltin] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const [viewing, setViewing] = useState<Role | null>(null);
  const [members, setMembers] = useState<Role | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<Values | null>(null);
  const [form] = Form.useForm<Values>();
  const [modal, contextHolder] = Modal.useModal();
  const selected: string[] = Form.useWatch('permissions', form) || [];
  const original = editing && editing !== 'new' ? editing : null;
  const added = selected.filter((code) => !original?.permissions.includes(code));
  const removed = (original?.permissions || []).filter((code) => !selected.includes(code));
  const label = (code: string) => {
    const permission = user?.catalog.find((p) => p.code === code);
    return permission ? permissionName(permission) : code;
  };
  const load = useCallback((reloadId?: number) => runLatestRequest({
    request: () => api<Role[]>('/admin/roles'),
    onStart: () => { setLoading(true); setLoadError(''); },
    onSuccess: (data) => {
      setRows(data);
      if (reloadId !== undefined) {
        const role = data.find((r) => r.id === reloadId);
        if (role) {
          setEditing(role); form.setFieldsValue(valuesOf(role));
          setDirty(false); setStale(false); setSaveError('');
        } else {
          setStale(true); setSaveError('该角色已被删除，请关闭编辑窗口');
        }
      }
    },
    onError: (e) => setLoadError(errorMessage(e)),
    onFinally: () => setLoading(false),
  }), [form, runLatestRequest]);
  useEffect(() => { load(); }, [load]);
  const groups = Array.from(new Set(user?.catalog.map((p) => p.group)));
  const filtered = rows.filter((r) => `${r.name} ${r.code}`.toLowerCase().includes(keyword.toLowerCase()) && (builtin === undefined || Number(!!r.builtin) === builtin));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  const visibleCount = Math.min(20, filtered.length - (currentPage - 1) * 20);
  const filteredMembers = (members?.users || []).filter((u) => `${u.username} ${u.nickname}`.toLowerCase().includes(memberSearch.trim().toLowerCase()));
  const openEditor = (role: Role | 'new') => {
    form.resetFields();
    form.setFieldsValue(role === 'new' ? { permissions: [] } : valuesOf(role));
    setEditing(role); setDirty(false); setSaveError(''); setStale(false); setPending(null);
  };
  const closeEditor = () => {
    if (busyRef.current || loading || pending) return;
    if (dirty) {
      modal.confirm({
        title: '放弃未保存的修改？', content: '当前角色修改尚未保存。', okText: '放弃修改', cancelText: '继续编辑', onOk: () => setEditing(null),
      });
    } else setEditing(null);
  };
  const reloadEditor = () => {
    if (!original || busyRef.current) return;
    const { id } = original;
    modal.confirm({
      title: '重新加载最新角色？',
      content: '最新内容将替换当前未保存的修改，请重新核对权限和关联用户。',
      okText: '重新加载',
      cancelText: '保留修改',
      onOk: () => load(id),
    });
  };
  async function save(values: Values) {
    if (busyRef.current || stale || !editing) return;
    busyRef.current = true; setBusy(true); setSaveError('');
    try {
      await api(original ? `/admin/roles/${original.id}` : '/admin/roles', original ? 'PATCH' : 'POST', {
        ...values, ...(original ? { revision: original.revision } : {}),
      });
      setPending(null); setEditing(null); setDirty(false);
      message.success(original ? '角色已保存，权限调整将在用户下次请求时生效' : '角色已创建，可到用户管理中分配');
      await load(); await refresh();
    } catch (e) {
      const detail = errorMessage(e);
      setPending(null); setSaveError(detail);
      if (detail.includes('角色已变更')) setStale(true);
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }
  async function remove(role: Role) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setDeleting(role.id); setOperationError('');
    try {
      await api(`/admin/roles/${role.id}`, 'DELETE');
      message.success('角色已删除');
    } catch (e) { setOperationError(errorMessage(e)); } finally {
      await load(); busyRef.current = false; setBusy(false); setDeleting(null);
    }
  }
  const viewedPermissions = (viewing?.permissions || []).map((code) => user?.catalog.find((p) => p.code === code) || {
    code, name: code, group: '其他权限', route: '',
  });
  const viewedGroups = Array.from(new Set(viewedPermissions.map((p) => p.group)));
  const permissionChanges = (
    <div className="role-changes" aria-live="polite">
      <div>
        <strong>
          新增权限（
          {added.length}
          ）
        </strong>
        <div>{added.length ? added.map((code) => <Tag color="success" key={code}>{label(code)}</Tag>) : <span>无</span>}</div>
      </div>
      <div>
        <strong>
          移除权限（
          {removed.length}
          ）
        </strong>
        <div>{removed.length ? removed.map((code) => <Tag color="error" key={code}>{label(code)}</Tag>) : <span>无</span>}</div>
      </div>
    </div>
  );
  return (
    <>
      {contextHolder}
      <PageHeading title="角色管理" description="按模块配置权限，让每位成员拥有合适的访问范围。" icon={<SafetyCertificateOutlined />} />
      {!isAdmin && <Alert type="info" showIcon message="只能配置自己已有的业务权限，不能修改自己所属角色。管理权限由系统管理员授予。" />}
      <Typography.Paragraph type="secondary">一个用户可拥有多个角色，权限取并集。调整后，下次接口请求即生效。</Typography.Paragraph>
      <div className="account-toolbar roles-filters">
        <Input.Search
          className="roles-search"
          placeholder="搜索角色名称或编码"
          aria-label="搜索角色名称或编码"
          value={search}
          allowClear
          maxLength={100}
          onChange={(e) => { setSearch(e.target.value); if (!e.target.value) { setKeyword(''); setPage(1); } }}
          onSearch={(v) => { setKeyword(v.trim()); setPage(1); }}
        />
        <Select className="roles-type" placeholder="角色类型" aria-label="角色类型" value={builtin} allowClear options={[{ value: 1, label: '内置角色' }, { value: 0, label: '自定义角色' }]} onChange={(v) => { setBuiltin(v); setPage(1); }} />
        <Button disabled={!search && builtin === undefined} onClick={() => { setSearch(''); setKeyword(''); setBuiltin(undefined); setPage(1); }}>重置筛选</Button>
        <Button type="primary" disabled={busy || loading || !!loadError} onClick={() => openEditor('new')}>创建角色</Button>
        <Button loading={loading} disabled={busy} onClick={() => { setOperationError(''); load(); }}>刷新</Button>
      </div>
      {loadError && <Alert type="error" message={loadError} description="当前显示上次成功加载的角色，请重试后再操作。" showIcon action={<Button size="small" onClick={() => load()}>重试</Button>} />}
      {operationError && <Alert type="error" message={operationError} showIcon closable onClose={() => setOperationError('')} />}
      <div className="roles-summary" aria-live="polite">{loading ? '正在加载角色…' : `共 ${rows.length} 个角色${keyword || builtin !== undefined ? `，筛选结果 ${filtered.length} 个` : ''}`}</div>
      <Table<Role>
        loading={loading}
        autoHeight={visibleCount <= 5}
        size="middle"
        scroll={{ x: 1160 }}
        rowKey="id"
        dataSource={filtered}
        locale={{ emptyText: loadError || '没有符合条件的角色' }}
        pagination={{
          current: currentPage, pageSize: 20, total: filtered.length, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true,
        }}
        columns={[
          {
            title: '角色',
            width: 200,
            render: (_, r) => (
              <div className="role-identity">
                <strong>{r.name}</strong>
                <Tag>{r.builtin ? '内置角色' : '自定义角色'}</Tag>
              </div>
            ),
          },
          { title: '编码', width: 150, dataIndex: 'code' },
          { title: '说明', width: 240, render: (_, r) => r.description || <Typography.Text type="secondary">暂无说明</Typography.Text> },
          {
            title: '关联用户',
            width: 230,
            render: (_, r) => (
              <div className="role-members">
                <div>{r.users.slice(0, 2).map((u) => <Tag key={u.id} title={`@${u.username}`}>{u.nickname || u.username}</Tag>)}</div>
                <Button type="link" size="small" onClick={() => { setMembers(r); setMemberSearch(''); }}>{r.users.length ? `共 ${r.users.length} 位 · 查看全部` : '暂无关联用户'}</Button>
              </div>
            ),
          },
          { title: '权限数', width: 80, render: (_, r) => r.permissions.length },
          {
            title: '操作',
            width: 260,
            render: (_, r) => (
              <Space size={4}>
                <Button type="text" size="small" aria-haspopup="dialog" onClick={() => setViewing(r)}>查看权限</Button>
                <Tooltip title={editReason(r)} trigger={['hover', 'focus']} getPopupContainer={(trigger) => trigger.closest<HTMLElement>('.ant-table-wrapper') || document.body}><Button className="role-action" type="text" size="small" aria-disabled={!!editReason(r)} disabled={busy || loading || !!loadError} onClick={() => { if (!editReason(r)) openEditor(r); }}>编辑权限</Button></Tooltip>
                <Tooltip title={deleteReason(r)} trigger={['hover', 'focus']} getPopupContainer={(trigger) => trigger.closest<HTMLElement>('.ant-table-wrapper') || document.body}><Popconfirm getPopupContainer={(trigger) => trigger.closest<HTMLElement>('.platform-content') || document.body} title={`确认删除角色“${r.name}”？`} description="仅可删除未关联用户的自定义角色。" okText="删除" cancelText="取消" disabled={busy || loading || !!loadError || !!deleteReason(r)} onConfirm={() => remove(r)}><Button className="role-action" type="text" size="small" danger aria-disabled={!!deleteReason(r)} loading={deleting === r.id} disabled={busy || loading || !!loadError}>删除</Button></Popconfirm></Tooltip>
              </Space>
            ),
          },
        ]}
      />
      <Modal title={`${viewing?.name || ''} · 权限`} width={760} open={!!viewing} onCancel={() => setViewing(null)} footer={<Button onClick={() => setViewing(null)}>关闭</Button>} destroyOnClose>
        <Typography.Paragraph type="secondary">
          已授予
          {viewedPermissions.length}
          {' '}
          项权限。
          {viewing?.code === 'admin' ? '系统管理员是内置角色，权限仅供查看。' : ''}
        </Typography.Paragraph>
        {viewedGroups.map((group) => (
          <div key={group} className="account-permission-group">
            <Typography.Text strong>{group}</Typography.Text>
            <div style={{ marginTop: 8 }}><Space wrap>{viewedPermissions.filter((p) => p.group === group).map((p) => <Tag key={p.code} title={p.code}>{permissionName(p)}</Tag>)}</Space></div>
          </div>
        ))}
        {!viewedPermissions.length && <Typography.Paragraph type="secondary">未授予权限</Typography.Paragraph>}
        {viewing?.permissions.includes('news:manage') && <Typography.Paragraph type="secondary">资讯来源管理影响所有用户：启停来源、调整采集间隔、立即采集。个人关注在资讯页面设置。</Typography.Paragraph>}
      </Modal>
      <Modal title={`${members?.name || ''} · 关联用户`} width={720} open={!!members} onCancel={() => setMembers(null)} footer={<Button onClick={() => setMembers(null)}>关闭</Button>} destroyOnClose>
        <div className="role-member-toolbar">
          <Typography.Text>
            共
            {members?.users.length || 0}
            {' '}
            位用户
          </Typography.Text>
          {managesUsers && members && <Link href={`/admin/users/?roleId=${members.id}`}>在用户管理中查看</Link>}
        </div>
        <Input.Search placeholder="搜索用户名或昵称" aria-label="搜索关联用户" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} allowClear />
        <Table<Member>
          loading={false}
          autoHeight={filteredMembers.length <= 5}
          size="small"
          rowKey="id"
          dataSource={filteredMembers}
          scroll={{ x: 480 }}
          pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{ emptyText: '没有符合条件的关联用户' }}
          columns={[
            {
              title: '用户',
              width: 320,
              render: (_, u) => (
                <div className="account-identity">
                  <AccountAvatar avatar={u.avatar} roles={members ? [members] : []} />
                  <div>
                    <strong>{u.nickname || u.username}</strong>
                    <small>
                      @
                      {u.username}
                    </small>
                  </div>
                </div>
              ),
            },
            { title: '账户状态', width: 100, render: (_, u) => <Tag color={u.active ? 'success' : 'error'}>{u.active ? '已启用' : '已禁用'}</Tag> },
            ...(managesUsers ? [{ title: '操作', width: 100, render: (_: unknown, u: Member) => <Link href={`/admin/users/?roleId=${members?.id}&keyword=${encodeURIComponent(u.username)}`}>管理用户</Link> }] : []),
          ]}
        />
      </Modal>
      <Modal title={original ? `编辑角色：${original.name}` : '创建角色'} width={760} open={!!editing} onCancel={closeEditor} onOk={() => form.submit()} okText={original ? '核对并保存' : '创建角色'} confirmLoading={busy} cancelButtonProps={{ disabled: busy || loading }} okButtonProps={{ disabled: stale || loading || !!pending }} keyboard={!busy && !pending} maskClosable={!busy && !pending} destroyOnClose>
        {saveError && <Alert type="error" message={saveError} showIcon action={stale && original ? <Button size="small" onClick={reloadEditor}>重新加载最新角色</Button> : undefined} />}
        {loading && <Typography.Paragraph type="secondary">正在加载最新角色…</Typography.Paragraph>}
        <Form form={form} layout="vertical" disabled={busy || loading || !!pending || stale} onValuesChange={() => { setDirty(true); if (!stale) setSaveError(''); }} onFinish={(values) => { if (original) setPending(values); else save(values); }}>
          <Form.Item
            name="name"
            label="名称"
            rules={[{
              required: true, whitespace: true, max: 64, message: '请输入角色名称，最多 64 个字符',
            }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="code" label="稳定编码" extra="2–32 位，以小写字母开头，可含数字、下划线或连字符。" rules={[{ required: true, pattern: /^[a-z][a-z0-9_-]{1,31}$/, message: '请输入有效的稳定编码' }]}><Input disabled={!!original?.builtin || busy || loading || !!pending || stale} maxLength={32} /></Form.Item>
          <Form.Item name="description" label="说明" rules={[{ max: 64 }]}><Input maxLength={64} /></Form.Item>
          {original?.code === 'user' && <Alert type="info" showIcon message="普通用户角色仅可配置业务查看权限。修改会影响当前关联用户，也会影响今后注册并获得此角色的用户。管理操作请创建独立角色，再到用户管理分配。" />}
          <Alert type="info" showIcon message={original ? `当前关联 ${original.users.length} 位用户。角色权限调整将在这些用户下次请求时生效。` : '新角色尚未关联用户，创建后可到用户管理中分配。'} description="多角色权限取并集。移除此角色的权限后，用户仍可能通过其他角色拥有该权限。" />
          <Form.Item name="permissions" label={`模块与操作权限（已选 ${selected.length} 项）`}>
            <Checkbox.Group className="role-permission-options">
              {groups.map((group) => (
                <div key={group} className="account-permission-group">
                  <Typography.Text strong>{group}</Typography.Text>
                  <div className="role-permission-group-items">{user?.catalog.filter((p) => p.group === group).map((p) => <Checkbox key={p.code} value={p.code} disabled={busy || loading || !!pending || stale || !grantable(p.code) || (original?.code === 'user' && p.group === '管理后台')}>{permissionName(p)}</Checkbox>)}</div>
                </div>
              ))}
            </Checkbox.Group>
          </Form.Item>
          {selected.includes('news:manage') && <Typography.Paragraph type="secondary">资讯来源管理影响全站采集，个人关注在资讯页面设置。</Typography.Paragraph>}
          {permissionChanges}
        </Form>
      </Modal>
      <Modal title="核对角色变更" zIndex={1100} width={640} open={!!pending} onCancel={() => { if (!busyRef.current) setPending(null); }} onOk={() => { if (pending) save(pending); }} okText="确认保存" cancelText="返回编辑" confirmLoading={busy} cancelButtonProps={{ disabled: busy }} keyboard={!busy} maskClosable={!busy}>
        <Typography.Paragraph>
          角色：
          <strong>{original?.name}</strong>
          ，当前关联
          <strong>{original?.users.length || 0}</strong>
          {' '}
          位用户。
        </Typography.Paragraph>
        {pending && original && (
        <div className="role-metadata-changes">
          {(['name', 'code', 'description'] as const).filter((key) => (pending[key] || '') !== (original[key] || '')).map((key) => (
            <p key={key}>
              {({ name: '名称', code: '编码', description: '说明' })[key]}
              ：
              {original[key] || '未填写'}
              {' '}
              →
              {' '}
              {pending[key] || '未填写'}
            </p>
          ))}
        </div>
        )}
        {permissionChanges}
        <Alert type="warning" showIcon message="保存后权限调整立即生效" description="用户下次请求将使用调整后的权限。多角色权限取并集，移除这里的权限不一定会移除用户的实际访问权限。" />
      </Modal>
    </>
  );
}
