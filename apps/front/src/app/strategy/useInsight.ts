import {
  useCallback, useEffect, useId, useRef, useState,
} from 'react';
import request from '@/api/request';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { errorMessage } from '@/api/errors';

export default function useInsight<T>(endpoint: string, params: Record<string, unknown>, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const instance = useId();
  const lastSuccess = useRef({ key: '', at: 0 });
  const key = JSON.stringify([params, attempt, endpoint]);
  const { requestConfig, runLatestRequest } = useLatestRequest(`strategy-${endpoint}-${instance}`);
  const retry = useCallback(() => setAttempt((v) => v + 1), []);
  useEffect(() => {
    if (!enabled || !params.date) return undefined;
    if (lastSuccess.current.key === key && Date.now() - lastSuccess.current.at < 120000) return undefined;
    const body = JSON.parse(key)[0];
    const codes = Array.isArray(body.codes) ? body.codes : null;
    // GET preserves guest read permissions. Bound URL length and concurrency
    // even for broad strategies with hundreds of candidates.
    const chunks: Record<string, unknown>[] = codes
      ? Array.from({ length: Math.ceil(codes.length / 200) }, (_, i) => ({ ...body, codes: codes.slice(i * 200, (i + 1) * 200).join(',') }))
      : [body];
    let active = true;
    runLatestRequest({
      request: async () => {
        const url = endpoint.startsWith('/') ? endpoint : `/strategy/${endpoint}`;
        const results = [];
        for (let i = 0; i < chunks.length; i += 3) {
          if (!active) throw new Error('查询已取消');
          // eslint-disable-next-line no-await-in-loop
          results.push(...await Promise.all(chunks.slice(i, i + 3).map((chunk, n) => request.get<T>(url, {
            params: chunk, timeout: 90000, ...requestConfig, raceKey: `${requestConfig.raceKey}-${i + n}`,
          }))));
        }
        const first = results[0];
        if (!first) throw new Error('没有可查询的候选股');
        if (results.length === 1) return first;
        const batches = results.map((result) => result.data) as any[];
        return { ...first, data: (Array.isArray(first.data) ? batches.flat() : { ...first.data, ready: batches.every((batch) => batch.ready), items: batches.flatMap((batch) => batch.items) }) as T };
      },
      onStart: () => { setLoading(true); setError(''); setData(null); },
      onSuccess: (r) => { if (active) { setData(r.data); lastSuccess.current = { key, at: Date.now() }; } },
      onError: (e) => { if (active) setError(errorMessage(e, '观察数据加载失败')); },
      onFinally: () => { if (active) { setLoading(false); setLoadedKey(key); } },
    });
    return () => { active = false; chunks.forEach((_, i) => request.cancelRace(`${requestConfig.raceKey}-${i}`)); };
  }, [endpoint, key, enabled, params.date, requestConfig, runLatestRequest]);
  return {
    data: loadedKey === key ? data : null, loading: enabled && (loading || loadedKey !== key), error: loadedKey === key ? error : '', retry,
  };
}
