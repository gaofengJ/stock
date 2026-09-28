'use client';

/* eslint-disable no-template-curly-in-string -- Ant Design 在运行时替换校验文案中的占位符。 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Button, ConfigProvider, Result, Spin,
} from 'antd';
import { themeConfig } from '@/theme';
import { errorMessage } from '@/api/errors';
import zhCN from 'antd/locale/zh_CN';
import { clearTradeDateCache } from '@/hooks/useDefaultTradeDate';
import { useOptionsState } from '@/store/useOptionsStore';
import {
  Account, allowedPath, api, clearCredential, homePath, getAccess,
} from './client';

const Context = createContext<{
  user: Account | null;
  trialRemaining: number;
  trialExpired: boolean;
  refresh:() => Promise<void>;
  logout: () => Promise<void>;
    }>({
      user: null, trialRemaining: 0, trialExpired: false, refresh: async () => {}, logout: async () => {},
    });
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
  const [loadError, setLoadError] = useState('');
  const [trialEnd, setTrialEnd] = useState(0);
  const [trialRemaining, setTrialRemaining] = useState(0);
  const [trialExpired, setTrialExpired] = useState(false);
  const authRequest = useRef(0);
  const publicPage = ['/login', '/register'].includes(path);
  const refresh = useCallback(async () => {
    authRequest.current += 1;
    const request = authRequest.current;
    try {
      const requestedAt = Date.now();
      const state = await getAccess(!publicPage);
      if (request !== authRequest.current) return;
      setUser(state.user);
      setTrialExpired(state.trial?.remainingMs === 0);
      const remaining = Math.max(0, (state.trial?.remainingMs || 0) - (Date.now() - requestedAt));
      setTrialEnd(state.user?.guest ? Date.now() + remaining : 0);
      setTrialRemaining(Math.ceil(remaining / 1000));
      setError('');
      setLoadError('');
    } catch (e) {
      if (request === authRequest.current) setLoadError(errorMessage(e));
    } finally {
      if (request === authRequest.current) setReady(true);
    }
  }, [publicPage]);
  const clear = useCallback(() => {
    // 已退出或会话失效后，较早的登录态请求不能恢复旧用户。
    authRequest.current += 1;
    setUser(null);
    setTrialEnd(0);
    setTrialRemaining(0);
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
  }, [refresh, path]);
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
    window.addEventListener('pageshow', focus);
    document.addEventListener('visibilitychange', focus);
    const timer = window.setInterval(focus, 60000);
    return () => {
      window.removeEventListener('account-http-error', changed);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', focus);
      document.removeEventListener('visibilitychange', focus);
      clearInterval(timer);
    };
  }, [clear, refresh, router]);
  useEffect(() => {
    if (!ready || loadError) return;
    if ((!user || (user.guest && !allowedPath(user, path))) && !publicPage) router.replace('/login');
    else if (user?.mustChangePassword && path !== '/profile') router.replace('/profile');
    else if (user && !user.guest && publicPage) router.replace(homePath(user));
  }, [user, ready, publicPage, path, router, loadError]);
  useEffect(() => {
    if (!user?.guest || !trialEnd) return undefined;
    let checking = false;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((trialEnd - Date.now()) / 1000));
      setTrialRemaining(seconds);
      if (!seconds && !checking) {
        checking = true;
        // Recheck before redirect: a different tab may have just logged in.
        refresh();
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [user?.guest, trialEnd, refresh]);
  useEffect(() => {
    setError('');
  }, [path]);
  const context = useMemo(
    () => ({
      user, trialRemaining, trialExpired, refresh, logout,
    }),
    [user, trialRemaining, trialExpired, refresh, logout],
  );
  let content = children;
  if (loadError) {
    content = <Result status="warning" title="暂时无法确认访问状态" subTitle={loadError} extra={<Button onClick={() => refresh()}>重试</Button>} />;
  } else if (
    !ready
    || (publicPage && !!user && !user.guest)
    || (!publicPage && (!user || (user.guest && !allowedPath(user, path))))
    || (user?.mustChangePassword && path !== '/profile')
  ) {
    content = (
      <div style={{ padding: 100, textAlign: 'center' }}>
        <Spin size="large" />
        <p>{publicPage && user && !user.guest ? '已登录，正在跳转' : '正在确认访问状态'}</p>
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
  return (
    <ConfigProvider
      theme={themeConfig}
      locale={zhCN}
      form={{
        validateMessages: {
          types: {
            string: '${label}必须为文本',
            method: '${label}格式不正确',
            array: '${label}必须为列表',
            object: '${label}格式不正确',
            number: '${label}必须为数字',
            date: '${label}必须为有效日期',
            boolean: '${label}必须为是或否',
            integer: '${label}必须为整数',
            float: '${label}必须为数字',
            regexp: '${label}格式不正确',
            email: '${label}必须为有效邮箱',
            url: '${label}必须为有效网址',
            hex: '${label}必须为十六进制数值',
          },
          pattern: { mismatch: '${label}格式不正确' },
        },
      }}
    >
      <Context.Provider value={context}>{content}</Context.Provider>
    </ConfigProvider>
  );
}
