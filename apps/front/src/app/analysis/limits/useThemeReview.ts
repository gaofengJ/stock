import { useCallback, useEffect, useState } from 'react';
import { marketRequest } from '@/api/market';
import { errorMessage } from '@/api/errors';
import { startWorkbenchPolling, WorkbenchSource } from '../../basic/components/workbench-polling';
import { useMarket } from '../components/MarketContext';

export default function useThemeReview<T extends { sources: WorkbenchSource[] }>(endpoint: string, extra: Record<string, unknown>, enabled = true) {
  const { date, scope, status } = useMarket();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((v) => v + 1), []);
  const key = JSON.stringify([endpoint, { date, scope, ...extra }, status?.revision, attempt]);
  const [state, setState] = useState<{ key: string; data: T | null; error: string; loading: boolean; pollingStopped: boolean }>({
    key: '', data: null, error: '', loading: true, pollingStopped: false,
  });
  useEffect(() => {
    if (!enabled || !date) return undefined;
    setState({
      key, data: null, error: '', loading: true, pollingStopped: false,
    });
    return startWorkbenchPolling<T>({
      read: async (signal) => (await marketRequest<T>(endpoint, JSON.parse(key)[1], { signal, autoShowError: false })).data,
      onValue: (data) => setState({
        key, data, error: '', loading: false, pollingStopped: false,
      }),
      onError: (error) => setState((old) => ({
        ...old, error: errorMessage(error, '复盘资料加载失败'), loading: false, pollingStopped: true,
      })),
      onStopped: () => setState((old) => ({ ...old, pollingStopped: true })),
    });
  }, [date, enabled, endpoint, key]);
  const current = enabled && state.key === key;
  return {
    data: current ? state.data : null, error: current ? state.error : '', loading: enabled && (!current || state.loading), pollingStopped: current && state.pollingStopped, retry,
  };
}
