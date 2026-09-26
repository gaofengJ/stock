'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Result, Spin } from 'antd';
import { clearTradeDateCache } from '@/hooks/useDefaultTradeDate';
import { useOptionsState } from '@/store/useOptionsStore';
import {
  Account, allowedPath, api, clearCredential, homePath,
} from './client';

const Context = createContext<{
  user: Account | null;
  refresh:() => Promise<void>;
  logout: () => Promise<void>;
    }>({ user: null, refresh: async () => {}, logout: async () => {} });
export const useAccount = () => useContext(Context);
export default function AccountBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname().replace(/\/$/, '') || '/';
  const router = useRouter();
  const [user, setUser] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const publicPage = ['/login', '/register'].includes(path);
  const refresh = useCallback(async () => {
    try {
      setUser(await api<Account>('/auth/me', 'GET', undefined, false));
      setError('');
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  const clear = useCallback(() => {
    setUser(null);
    clearCredential();
    clearTradeDateCache();
    useOptionsState.setState({ allOptions: {} });
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', 'POST');
    clear();
    // A document navigation discards all page state and in-flight business responses.
    window.location.replace('/login/');
  }, [clear]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail === 401) {
        clear();
        router.replace('/login');
      } else {
        setError('权限已调整，当前操作不可用');
        refresh();
      }
    };
    const focus = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener('account-http-error', changed);
    window.addEventListener('focus', focus);
    const timer = window.setInterval(focus, 60000);
    return () => {
      window.removeEventListener('account-http-error', changed);
      window.removeEventListener('focus', focus);
      clearInterval(timer);
    };
  }, [clear, refresh, router]);
  useEffect(() => {
    if (!ready) return;
    if (!user && !publicPage) router.replace('/login');
    else if (user?.mustChangePassword && path !== '/profile') router.replace('/profile');
    else if (user && publicPage) router.replace(homePath(user));
  }, [user, ready, publicPage, path, router]);
  useEffect(() => {
    setError('');
  }, [path]);
  const context = useMemo(
    () => ({ user, refresh, logout }),
    [user, refresh, logout],
  );
  let content = children;
  if (
    !ready
    || (!publicPage && !user)
    || (user?.mustChangePassword && path !== '/profile')
  ) {
    content = (
      <div style={{ padding: 100, textAlign: 'center' }}>
        <Spin size="large" tip="正在恢复登录状态" />
      </div>
    );
  } else if (!publicPage && (!allowedPath(user, path) || error)) {
    content = (
      <Result
        status="403"
        title="没有访问权限"
        subTitle={error || '请联系管理员分配对应模块权限。'}
        extra={(
          <Button
            onClick={() => {
              setError('');
              router.push('/profile');
            }}
          >
            个人中心
          </Button>
        )}
      />
    );
  }
  return <Context.Provider value={context}>{content}</Context.Provider>;
}
