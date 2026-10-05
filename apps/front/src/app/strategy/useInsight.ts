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
  const recent = useRef(new Map<string, { data: T; at: number }>());
  const key = JSON.stringify([params, attempt, endpoint]);
  const { requestConfig, runLatestRequest } = useLatestRequest(`strategy-${endpoint}-${instance}`);
  const retry = useCallback(() => setAttempt((v) => v + 1), []);
  useEffect(() => {
    if (!enabled || !params.date) return undefined;
    const cached = recent.current.get(key);
    if (cached && Date.now() - cached.at < 120000) {
      setData(cached.data); setLoadedKey(key); setLoading(false); setError('');
      return undefined;
    }
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
      onSuccess: (r) => {
        if (active) {
          setData(r.data);
          recent.current.forEach((entry, id) => { if (Date.now() - entry.at >= 120000) recent.current.delete(id); });
          if (recent.current.size >= 12) recent.current.delete(recent.current.keys().next().value!);
          recent.current.set(key, { data: r.data, at: Date.now() });
        }
      },
      onError: (e) => { if (active) setError(errorMessage(e, '观察数据加载失败')); },
      onFinally: () => { if (active) { setLoading(false); setLoadedKey(key); } },
    });
    return () => { active = false; chunks.forEach((_, i) => request.cancelRace(`${requestConfig.raceKey}-${i}`)); };
  }, [endpoint, key, enabled, params.date, requestConfig, runLatestRequest]);
  return {
    data: loadedKey === key ? data : null, loading: enabled && (loading || loadedKey !== key), error: loadedKey === key ? error : '', retry,
  };
}
