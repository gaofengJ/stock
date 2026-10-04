import { useCallback, useEffect, useState } from 'react';
import request from '@/api/request';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';

export default function useInsight<T>(endpoint: string, params: Record<string, unknown>, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const key = JSON.stringify([params, attempt]);
  const { requestConfig, runLatestRequest } = useLatestRequest(`strategy-${endpoint}`);
  const retry = useCallback(() => setAttempt((v) => v + 1), []);
  useEffect(() => {
    if (!enabled || !params.date) return;
    runLatestRequest({
      request: () => request.get<T>(`/strategy/${endpoint}`, { params: JSON.parse(key)[0], timeout: 90000, ...requestConfig }),
      onStart: () => { setLoading(true); setError(''); setData(null); },
      onSuccess: (r) => setData(r.data),
      onError: (e) => setError(errorMessage(e, '观察数据加载失败')),
      onFinally: () => { setLoading(false); setLoadedKey(key); },
    });
  }, [endpoint, key, enabled, params.date, requestConfig, runLatestRequest]);
  return {
    data: loadedKey === key ? data : null, loading: enabled && (loading || loadedKey !== key), error: loadedKey === key ? error : '', retry,
  };
}
