import { errorMessage } from '@/api/errors';
import { useCallback, useEffect, useState } from 'react';
import { marketRequest } from '@/api/market';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useMarket } from './MarketContext';

export default function useMarketData<T>(endpoint: string, extra: Record<string, unknown> = {}, enabled = true) {
  const {
    date, scope, days: selectedDays, status,
  } = useMarket();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((v) => v + 1), []);
  const [error, setError] = useState('');
  const { requestConfig, runLatestRequest } = useLatestRequest(`market-${endpoint}`);
  const extraKey = JSON.stringify(extra);
  const defaultDays = ['limits', 'ladder'].includes(endpoint) ? 20 : selectedDays;
  const days = typeof extra.days === 'number' ? extra.days : defaultDays;
  const revision = status?.revision;
  const requestKey = JSON.stringify([endpoint, date, scope, days, extraKey, revision, attempt]);
  const [loadedKey, setLoadedKey] = useState('');
  useEffect(() => {
    if (!date || !enabled) return;
    runLatestRequest({
      request: () => marketRequest<T>(endpoint, {
        date, scope, days, ...JSON.parse(extraKey),
      }, requestConfig),
      onStart: () => { setLoading(true); setError(''); },
      onSuccess: (r) => setData(r.data),
      onError: (e) => setError(errorMessage(e, '数据加载失败')),
      onFinally: () => { setLoadedKey(requestKey); setLoading(false); },
    });
  }, [requestKey, attempt, endpoint, date, scope, days, extraKey, revision, requestConfig, runLatestRequest, enabled]);
  return {
    data,
    loading: enabled && (loading || loadedKey !== requestKey),
    error: loadedKey === requestKey ? error : '',
    retry,
  };
}
