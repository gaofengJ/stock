'use client';

import {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import { Button, ConfigProvider, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { createThemeConfig } from '@/theme';
import { darkUiColors, uiColors } from '@/colors';

type Mode = 'light' | 'dark';
const storageKey = 'stock-theme';
const Context = createContext({
  mode: 'light' as Mode, colors: uiColors, themeConfig: createThemeConfig(false), toggle: () => {},
});
export const useSiteTheme = () => useContext(Context);

const renderStaticTheme = (dark: boolean) => function StaticTheme(content: React.ReactNode) {
  return <ConfigProvider theme={createThemeConfig(dark)} locale={zhCN}>{content}</ConfigProvider>;
};

export default function SiteTheme({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('light');
  useEffect(() => {
    setMode(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        const next = event.newValue === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        setMode(next);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const value = useMemo(() => ({
    mode,
    colors: mode === 'dark' ? darkUiColors : uiColors,
    themeConfig: createThemeConfig(mode === 'dark'),
    toggle: () => {
      const next = mode === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      setMode(next);
      try { localStorage.setItem(storageKey, next); } catch { /* Private browsing can disable storage. */ }
    },
  }), [mode]);
  useEffect(() => {
    ConfigProvider.config({ holderRender: renderStaticTheme(mode === 'dark') });
  }, [mode]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function ThemeToggle() {
  const { mode, toggle } = useSiteTheme();
  const label = mode === 'dark' ? '切换为浅色主题' : '切换为暗色主题';
  return (
    <Tooltip title={label}>
      <Button type="text" className="theme-toggle" aria-label={label} aria-pressed={mode === 'dark'} onClick={toggle} icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />} />
    </Tooltip>
  );
}
