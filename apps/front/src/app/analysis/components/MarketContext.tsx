'use client';

import { errorMessage } from '@/api/errors';
import {
  createContext, useContext, useEffect, useMemo, useState, useRef,
} from 'react';
import { marketRequest, MarketScope, MarketStatus } from '@/api/market';

interface MarketSelection {
  date: string; scope: MarketScope; days: number; status: MarketStatus | null; error: string;
  retry: () => void;
  select: (value: { date?: string; scope?: MarketScope; days?: number }) => void;
}
const Context = createContext<MarketSelection | null>(null);
export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState({ date: '', scope: 'all' as MarketScope, days: 20 });
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const latest = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await marketRequest<MarketStatus>('status');
        if (!active) return;
        setStatus(data); setError('');
        const previousLatest = latest.current;
        latest.current = data.latestDate;
        setSelection((old) => ({ ...old, date: (!old.date || old.date === previousLatest) ? data.latestDate || old.date : old.date }));
      } catch (e) { if (active) setError(errorMessage(e, '同步状态加载失败')); }
    };
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [attempt]);
  const value = useMemo(() => ({
    ...selection, status, error, retry: () => setAttempt((v) => v + 1), select: (change: Partial<typeof selection>) => setSelection((old) => ({ ...old, ...change })),
  }), [selection, status, error]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMarket() {
  const value = useContext(Context);
  if (!value) throw new Error('市场数据尚未初始化，请刷新页面后重试');
  return value;
}
