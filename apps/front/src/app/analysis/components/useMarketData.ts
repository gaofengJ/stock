import { errorMessage } from '@/api/errors';
import { useEffect, useState } from 'react';
import { marketRequest } from '@/api/market';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { useMarket } from './MarketContext';

export default function useMarketData<T>(endpoint: string, extra: Record<string, unknown> = {}) {
  const {
    date, scope, days, status,
  } = useMarket();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { requestConfig, runLatestRequest } = useLatestRequest(`market-${endpoint}`);
  const extraKey = JSON.stringify(extra);
  const revision = status?.revision;
  useEffect(() => {
    if (!date) return;
    runLatestRequest({
      request: () => marketRequest<T>(endpoint, {
        date, scope, days, ...JSON.parse(extraKey),
      }, requestConfig),
      onStart: () => { setLoading(true); setData(null); setError(''); },
      onSuccess: (r) => setData(r.data),
      onError: (e) => setError(errorMessage(e, '数据加载失败')),
      onFinally: () => setLoading(false),
    });
  }, [endpoint, date, scope, days, extraKey, revision, requestConfig, runLatestRequest]);
  return { data, loading, error };
}
