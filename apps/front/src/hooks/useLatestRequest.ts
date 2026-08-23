import {
  useCallback, useEffect, useMemo, useRef,
} from 'react';
import axios from '@/api/request';
import type { RequestConfig } from '@/api/types';

interface ILatestRequestOptions<T> {
  request: () => Promise<T>;
  onStart?: () => void;
  onSuccess: (result: T) => void;
  onError?: (error: unknown) => void;
  onFinally?: () => void;
}

/**
 * 只允许同一业务作用域内最后一次请求更新页面状态。
 */
export const useLatestRequest = (raceKey: string) => {
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    requestIdRef.current += 1;
    axios.cancelRace(raceKey);
  }, [raceKey]);

  const requestConfig = useMemo<RequestConfig>(() => ({
    race: true,
    raceKey,
  }), [raceKey]);

  const runLatestRequest = useCallback(async <T>({
    request,
    onStart,
    onSuccess,
    onError,
    onFinally,
  }: ILatestRequestOptions<T>) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    onStart?.();

    try {
      const result = await request();
      if (requestId === requestIdRef.current) onSuccess(result);
    } catch (error) {
      if (requestId === requestIdRef.current) onError?.(error);
    } finally {
      if (requestId === requestIdRef.current) onFinally?.();
    }
  }, []);

  return { requestConfig, runLatestRequest };
};
