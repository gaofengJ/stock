'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Badge, Button, Empty, List, Space, Spin, Tag, message,
} from 'antd';
import { errorMessage } from '@/api/errors';
import { api } from './client';

interface Activity {
  unread: number;
  latestId: number;
  items: { id: number; username: string; nickname?: string; createdAt: string; registered: boolean; unread: boolean }[];
}

export function useLoginActivity(enabled: boolean) {
  const [data, setData] = useState<Activity>({ unread: 0, latestId: 0, items: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    sequence.current += 1;
    const request = sequence.current;
    setLoading(true);
    try {
      const next = await api<Activity>('/admin/login-activity', 'GET', undefined, false);
      if (request === sequence.current) { setData(next); setError(''); }
    } catch (e) {
      if (request === sequence.current) setError(errorMessage(e));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const visibleRefresh = () => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(visibleRefresh, 30000);
    window.addEventListener('focus', visibleRefresh);
    return () => { sequence.current += 1; clearInterval(timer); window.removeEventListener('focus', visibleRefresh); };
  }, [enabled, refresh]);
  return {
    data, error, loading, refresh,
  };
}

export const LoginActivityContext = createContext<ReturnType<typeof useLoginActivity> | null>(null);

export default function LoginActivity() {
  const activity = useContext(LoginActivityContext);
  const [saving, setSaving] = useState(false);
  if (!activity) return null;
  const {
    data, error, loading, refresh,
  } = activity;
  return (
    <section className="login-activity" aria-label="用户登录动态">
      <p className="text-secondary">普通用户登录及注册后自动登录都会记录，管理员登录不提醒。每30秒更新，保留最近90天，展示最近50条。</p>
      <Space style={{ marginBottom: 16 }}>
        <span role="status">{`未读 ${data.unread} 条`}</span>
        <Button loading={loading} onClick={() => refresh()}>刷新</Button>
        <Button
          disabled={!data.unread || !!error}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api('/admin/login-activity/read', 'POST', { throughId: data.latestId });
              await refresh();
            } catch (e) { message.error(errorMessage(e)); } finally { setSaving(false); }
          }}
        >
          全部标为已读
        </Button>
      </Space>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading && !data.items.length}>
        <List
          dataSource={data.items}
          locale={{ emptyText: <Empty description="暂无用户登录动态" /> }}
          renderItem={(item) => (
            <List.Item key={item.id}>
              <List.Item.Meta
                title={(
                  <Space>
                    <Badge status={item.unread ? 'error' : 'default'} />
                    <span>
                      {item.nickname || item.username}
                      {item.nickname ? `（${item.username}）` : ''}
                    </span>
                  </Space>
)}
                description={(
                  <>
                    <Tag color={item.registered ? 'pink' : undefined}>{item.registered ? '注册并登录' : '登录成功'}</Tag>
                    <span>{new Date(item.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</span>
                  </>
)}
              />
            </List.Item>
          )}
        />
      </Spin>
      <p className="text-secondary">已读状态仅影响当前管理员；标记后新到的登录记录仍会保留提醒。</p>
    </section>
  );
}
