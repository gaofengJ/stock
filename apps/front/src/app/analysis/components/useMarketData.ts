import {
  useCallback, useEffect, useId, useRef, useState,
} from 'react';
import { errorMessage } from '@/api/errors';
import { marketRequest } from '@/api/market';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useMarket } from './MarketContext';

export default function useMarketData<T>(endpoint: string, extra: Record<string, unknown> = {}, enabled = true, reuseOnActivate = false) {
  const {
    date, scope, days: selectedDays, status,
  } = useMarket();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((v) => v + 1), []);
  const [error, setError] = useState('');
  const instance = useId();
  const { requestConfig, runLatestRequest } = useLatestRequest(`market-${endpoint}-${instance}`);
  const extraKey = JSON.stringify(extra);
  const defaultDays = ['limits', 'ladder'].includes(endpoint) ? 20 : selectedDays;
  const days = typeof extra.days === 'number' ? extra.days : defaultDays;
  const revision = status?.revision;
  const requestKey = JSON.stringify([endpoint, date, scope, days, extraKey, revision, attempt]);
  const [loadedKey, setLoadedKey] = useState('');
  const successfulKey = useRef('');
  const pendingKey = useRef('');
  useEffect(() => () => { pendingKey.current = ''; }, []);
  useEffect(() => {
    if (!date || !enabled) return;
    // Keep tab data/in-flight work for the exact selection. Revision changes,
    // filters and explicit retries still produce a new key and fetch normally.
    if (reuseOnActivate && [successfulKey.current, pendingKey.current].includes(requestKey)) return;
    runLatestRequest({
      request: () => marketRequest<T>(endpoint, {
        date, scope, days, ...JSON.parse(extraKey),
      }, requestConfig),
      onStart: () => { successfulKey.current = ''; pendingKey.current = requestKey; setLoading(true); setError(''); },
      onSuccess: (r) => { successfulKey.current = requestKey; setData(r.data); },
      onError: (e) => setError(errorMessage(e, '数据加载失败')),
      onFinally: () => { pendingKey.current = ''; setLoadedKey(requestKey); setLoading(false); },
    });
  }, [requestKey, attempt, endpoint, date, scope, days, extraKey, revision, requestConfig, runLatestRequest, enabled, reuseOnActivate]);
  return {
    data,
    loading: enabled && (loading || loadedKey !== requestKey),
    error: loadedKey === requestKey ? error : '',
    retry,
  };
}
