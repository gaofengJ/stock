'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Button, DatePicker, Input, Modal, Select, Tag, message,
} from 'antd';
import type { Dayjs } from 'dayjs';
import Table from '@/components/DataTable';
import HelpTooltip from '@/components/HelpTooltip';
import { errorMessage } from '@/api/errors';
import { api } from './client';

interface ActivityItem {
  id: number;
  username: string;
  nickname?: string;
  createdAt: string;
  registered: boolean;
  isAdmin?: boolean;
  unread: boolean;
}
interface Activity {
  unread: number;
  latestId: number;
  total: number;
  page: number;
  pageSize: number;
  items: ActivityItem[];
}
const emptyActivity: Activity = {
  unread: 0, latestId: 0, total: 0, page: 1, pageSize: 20, items: [],
};
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai', hour12: false,
});

// The navigation only needs the global count; the page supplies its own filters.
export function useLoginActivity(enabled: boolean, query = 'pageSize=1') {
  const [data, setData] = useState<Activity>(emptyActivity);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async (silent = false) => {
    if (!enabled) return;
    sequence.current += 1;
    const request = sequence.current;
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const next = await api<Activity>(`/admin/login-activity?${query}`, 'GET', undefined, false);
      if (request === sequence.current) {
        setData(next);
        setError('');
        setUpdatedAt(new Date().toISOString());
      }
    } catch (e) {
      if (request === sequence.current) setError(errorMessage(e));
    } finally {
      if (request === sequence.current) { setLoading(false); setRefreshing(false); }
    }
  }, [enabled, query]);
  useEffect(() => {
    if (!enabled) {
      setData(emptyActivity);
      setError('');
      setUpdatedAt('');
      setLoading(false);
      setRefreshing(false);
      return undefined;
    }
    refresh();
    const visibleRefresh = () => { if (!document.hidden) refresh(true); };
    const timer = window.setInterval(visibleRefresh, 30000);
    window.addEventListener('focus', visibleRefresh);
    return () => { sequence.current += 1; clearInterval(timer); window.removeEventListener('focus', visibleRefresh); };
  }, [enabled, refresh]);
  return {
    data, error, loading, refreshing, updatedAt, refresh,
  };
}

export const LoginActivityContext = createContext<ReturnType<typeof useLoginActivity> | null>(null);

export default function LoginActivity() {
  const navigation = useContext(LoginActivityContext);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>();
  const [event, setEvent] = useState<string>();
  const [dates, setDates] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [saving, setSaving] = useState<number | 'all' | null>(null);
  const [modal, contextHolder] = Modal.useModal();
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (keyword) query.set('keyword', keyword);
  if (status) query.set('status', status);
  if (event) query.set('event', event);
  if (dates?.[0]) query.set('startDate', dates[0].format('YYYY-MM-DD'));
  if (dates?.[1]) query.set('endDate', dates[1].format('YYYY-MM-DD'));
  const {
    data, error, loading, refreshing, updatedAt, refresh,
  } = useLoginActivity(!!navigation, query.toString());
  const filtered = !!(keyword || status || event || dates);
  const emptyText = filtered ? '没有符合筛选条件的记录' : '最近 90 天暂无用户登录动态';
  const reload = async () => {
    await Promise.all([refresh(), navigation?.refresh(true)]);
  };
  // A read request may finish after the user changes filters or pages.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  async function markRead(id?: number, throughId?: number) {
    setSaving(id ?? 'all');
    try {
      if (id) await api(`/admin/login-activity/${id}/read`, 'POST');
      else await api('/admin/login-activity/read', 'POST', { throughId });
      message.success(id ? '该记录已标为已读' : '已标记所选范围内的全部记录');
      await reloadRef.current();
    } catch (e) { message.error(errorMessage(e)); } finally { setSaving(null); }
  }
  if (!navigation) return null;
  return (
    <section className="login-activity" aria-label="用户登录动态">
      {contextHolder}
      <div className="account-toolbar login-activity-filters">
        <Input.Search
          aria-label="搜索用户名或昵称"
          placeholder="搜索用户名或昵称"
          value={search}
          maxLength={100}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value);
            if (!e.target.value) { setKeyword(''); setPage(1); }
          }}
          onSearch={(value) => { setKeyword(value.trim()); setPage(1); }}
        />
        <DatePicker.RangePicker
          aria-label="登录日期（北京时间）"
          value={dates}
          placeholder={['开始日期', '结束日期']}
          onChange={(value) => { setDates(value); setPage(1); }}
        />
        <Select
          aria-label="事件类型"
          placeholder="全部事件"
          value={event}
          allowClear
          options={[{ value: 'login', label: '登录成功' }, { value: 'register', label: '注册并登录' }]}
          onChange={(value) => { setEvent(value); setPage(1); }}
        />
        <Select
          aria-label="已读状态"
          placeholder="全部状态"
          value={status}
          allowClear
          options={[{ value: 'unread', label: '未读' }, { value: 'read', label: '已读' }]}
          onChange={(value) => { setStatus(value); setPage(1); }}
        />
        <Button
          disabled={!filtered && !search}
          onClick={() => {
            setSearch(''); setKeyword(''); setStatus(undefined); setEvent(undefined); setDates(null); setPage(1);
          }}
        >
          重置
        </Button>
      </div>
      <div className="login-activity-actions">
        <div className="login-activity-summary">
          <span role="status">
            全部未读
            {' '}
            <strong>{error ? '—' : data.unread}</strong>
            {' '}
            条
          </span>
          <span className="login-activity-note">
            {filtered ? '筛选结果' : '全部记录'}
            {' '}
            {data.total}
            {' '}
            条
          </span>
          <HelpTooltip label="登录动态" title="记录账号成功登录及注册后的自动登录。管理员标识为登录时身份。每 30 秒自动更新，保留最近 90 天；日期与时间均为北京时间。已读状态仅影响当前管理员。" />
        </div>
        <div className="login-activity-buttons">
          <Button loading={refreshing} onClick={reload}>刷新</Button>
          <Button
            disabled={!data.unread || !!error || loading || saving !== null}
            loading={saving === 'all'}
            onClick={() => {
              const { latestId, unread } = data;
              modal.confirm({
                title: `将全部 ${unread} 条未读记录标为已读？`,
                content: '包含其他分页及筛选条件外的记录，仅影响你的已读状态。打开此确认框后新增的记录不会被标记。',
                okText: '全部标为已读',
                cancelText: '取消',
                onOk: () => markRead(undefined, latestId),
              });
            }}
          >
            全部标为已读
          </Button>
        </div>
      </div>
      {error && <Alert type="error" showIcon message={error} description={data.items.length ? '当前显示上次成功加载的记录。' : undefined} action={<Button size="small" onClick={reload}>重试</Button>} />}
      <Table<ActivityItem>
        rowKey="id"
        size="middle"
        loading={loading}
        scroll={{ x: 820 }}
        autoHeight={data.items.length <= 5}
        rowClassName={(item) => (item.unread ? 'login-activity-unread' : '')}
        dataSource={data.items}
        locale={{ emptyText: error ? '登录动态加载失败，请重试' : emptyText }}
        pagination={{
          current: loading ? page : data.page,
          pageSize,
          total: data.total,
          showSizeChanger: true,
          hideOnSinglePage: true,
          pageSizeOptions: [20, 50, 100],
          onChange: (next, size) => { setPage(size === pageSize ? next : 1); setPageSize(size); },
          showTotal: (total) => `共 ${total} 条`,
        }}
        columns={[
          {
            title: '用户',
            render: (_, item) => (
              <div className="login-activity-user">
                <strong>
                  {item.nickname || item.username}
                  {item.isAdmin && <Tag color="purple">管理员</Tag>}
                </strong>
                {item.nickname && item.nickname !== item.username && (
                <small>
                  @
                  {item.username}
                </small>
                )}
              </div>
            ),
          },
          { title: '事件', width: 160, render: (_, item) => <Tag color={item.registered ? 'blue' : undefined}>{item.registered ? '注册并登录' : '登录成功'}</Tag> },
          { title: '登录时间（北京时间）', width: 240, render: (_, item) => <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time> },
          { title: '状态', width: 100, render: (_, item) => <span className={item.unread ? 'login-activity-unread-label' : 'login-activity-note'}>{item.unread ? '未读' : '已读'}</span> },
          {
            title: '操作',
            width: 120,
            render: (_, item) => (item.unread ? <Button type="link" size="small" loading={saving === item.id} disabled={saving !== null || loading || !!error} onClick={() => markRead(item.id)}>标为已读</Button> : <span className="login-activity-note">—</span>),
          },
        ]}
      />
      <p className="login-activity-note login-activity-updated">
        {updatedAt ? `最近更新 ${formatTime(updatedAt)}` : '尚未完成首次加载'}
        {' '}
        · 每 30 秒自动更新
      </p>
    </section>
  );
}
