'use client';

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Alert, Badge, Button, Drawer, Empty, List, Space, Spin, Tag, message,
} from 'antd';
import { BellOutlined } from '@ant-design/icons';
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

export default function LoginActivity({ activity }: { activity: ReturnType<typeof useLoginActivity> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const {
    data, error, loading, refresh,
  } = activity;
  return (
    <>
      <Badge count={data.unread} overflowCount={99} size="small">
        <Button icon={<BellOutlined />} onClick={() => { setOpen(true); refresh(); }} aria-label={`用户登录动态，${data.unread}条未读`}>登录动态</Button>
      </Badge>
      <Drawer title="用户登录动态" open={open} onClose={() => setOpen(false)} width={440}>
        <p className="text-secondary">普通用户登录及注册后自动登录都会记录，管理员登录不提醒。每30秒更新，保留最近90天，展示最近50条。</p>
        <Space style={{ marginBottom: 16 }}>
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
      </Drawer>
    </>
  );
}
