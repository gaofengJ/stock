'use client';

import { errorMessage } from '@/api/errors';
import {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { marketRequest, MarketScope, MarketStatus } from '@/api/market';
import { defaultSelection, linkedSelection, Selection } from './market-navigation';

interface MarketSelection {
  date: string; scope: MarketScope; days: number; status: MarketStatus | null; error: string;
  retry: () => void;
  select: (value: { date?: string; scope?: MarketScope; days?: number }) => void;
}
const Context = createContext<MarketSelection | null>(null);
export function MarketProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const query = useSearchParams().toString();
  const [selections, setSelections] = useState<Record<string, Selection & { query?: string }>>({});
  const saved = selections[path] || defaultSelection;
  const selection = useMemo(() => (query && (!('query' in saved) || saved.query !== query)
    ? { ...saved, ...linkedSelection(query), query } : saved), [query, saved]);
  useEffect(() => {
    if (query) {
      setSelections((old) => ({
        ...old,
        [path]: { ...(old[path] || defaultSelection), ...linkedSelection(query), query },
      }));
    }
  }, [path, query]);
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await marketRequest<MarketStatus>('status');
        if (!active) return;
        setStatus(data); setError('');
      } catch (e) { if (active) setError(errorMessage(e, '同步状态加载失败')); }
    };
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [attempt]);
  const value = useMemo(() => ({
    ...selection,
    date: selection.date || status?.latestDate || '',
    status,
    error,
    retry: () => setAttempt((v) => v + 1),
    select: (change: Partial<Selection>) => setSelections((old) => ({ ...old, [path]: { ...selection, ...change } })),
  }), [selection, status, error, path]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMarket() {
  const value = useContext(Context);
  if (!value) throw new Error('市场数据尚未初始化，请刷新页面后重试');
  return value;
}
