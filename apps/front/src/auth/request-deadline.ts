export interface RequestOptions { signal?: AbortSignal; timeout?: number }
export const REQUEST_TIMEOUT = 30000;

/** Bound the entire operation, including response parsing and shared prerequisites. */
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  { signal: parent, timeout = REQUEST_TIMEOUT }: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: () => void = () => {};
  try {
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(controller.signal.reason || new DOMException('请求已取消', 'AbortError'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    if (parent?.aborted) abort();
    else parent?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => controller.abort(new Error('请求超时，请稍后重试')), Math.max(1, timeout));
    return await Promise.race([cancelled, controller.signal.aborted ? cancelled : operation(controller.signal)]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}
