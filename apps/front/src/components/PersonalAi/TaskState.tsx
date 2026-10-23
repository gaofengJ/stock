'use client';

import {
  createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState, useMemo,
} from 'react';
import { useAccount } from '@/auth/Boundary';
import { isPersonalAiOwner } from '@/auth/client';
import { activeTask, ConsoleState, consoleRequest } from './client';

interface State { state: ConsoleState | null; error: string; refresh: () => Promise<ConsoleState> }
const Context = createContext<State | null>(null);
export const useAiTasks = () => useContext(Context);
export default function TaskState({ children }: { children: ReactNode }) {
  const { user } = useAccount(); const capture = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reviewCapture');
  const owner = isPersonalAiOwner(user) && !capture ? user!.id : 0;
  const [state, setState] = useState<ConsoleState | null>(null); const [error, setError] = useState('');
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const pending = useRef<Promise<ConsoleState> | null>(null);
  const refresh = useCallback(() => {
    if (!owner) return Promise.reject(Error('仅本人可用'));
    if (pending.current) return pending.current;
    const task = consoleRequest<ConsoleState>('/status').then((value) => { if (currentOwner.current === owner) { setState(value); setError(''); } return value; }).catch((reason) => { if (currentOwner.current === owner) setError((reason as Error).message); throw reason; }).finally(() => { if (pending.current === task) pending.current = null; });
    pending.current = task; return task;
  }, [owner]);
  useEffect(() => { setState(null); setError(''); pending.current = null; if (owner) refresh().catch(() => {}); }, [owner, refresh]);
  const running = state?.tasks.some((task) => activeTask(task.status));
  useEffect(() => {
    if (!owner) return undefined;
    const poll = () => { if (!document.hidden) refresh().catch(() => {}); };
    const timer = window.setInterval(poll, running ? 5000 : 30000);
    window.addEventListener('focus', poll); document.addEventListener('visibilitychange', poll);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll); };
  }, [owner, refresh, running]);
  const value = useMemo(() => ({ state, error, refresh }), [state, error, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
