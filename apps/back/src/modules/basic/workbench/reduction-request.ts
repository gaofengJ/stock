import axios from 'axios';
import { Agent } from 'https';

/** Only controlled diagnostic text may be returned to clients; never include request URLs or headers. */
export class ReductionSourceError extends Error {}

export type ReductionRequestFailure = {
  stage: '目录' | '正文';
  attempt: number;
  code: string;
  status?: number;
  reusedSocket: boolean;
  tlsConnected: boolean;
};

export async function reductionRequest(
  get: typeof axios.get,
  url: string,
  config: Parameters<typeof axios.get>[1],
  stage: '目录' | '正文',
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  hooks: {
    beforeAttempt?: () => Promise<void>;
    onFailure?: (failure: ReductionRequestFailure) => void;
  } = {},
) {
  let freshConnection = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // A reset must not send every retry back through the same connection pool.
    const retryAgent = freshConnection
      ? new Agent({ ...(config?.httpsAgent?.options || {}), keepAlive: false })
      : undefined;
    try {
      // eslint-disable-next-line no-await-in-loop
      await hooks.beforeAttempt?.();
      // eslint-disable-next-line no-await-in-loop
      return await get(
        url,
        retryAgent ? { ...config, httpsAgent: retryAgent } : config,
      );
    } catch (error) {
      const status = Number(error?.response?.status);
      const code = /^[A-Z_]{2,32}$/.test(error?.code || '')
        ? error.code
        : 'REQUEST_FAILED';
      hooks.onFailure?.({
        stage,
        attempt,
        code,
        ...(Number.isInteger(status) ? { status } : {}),
        reusedSocket: !!error?.request?.reusedSocket,
        tlsConnected: !!error?.request?.socket?.getProtocol?.(),
      });
      if (['ECONNRESET', 'EPIPE'].includes(code)) freshConnection = true;
      const timeout = ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code);
      const transient =
        timeout ||
        [
          'ECONNRESET',
          'ECONNREFUSED',
          'EPIPE',
          'EAI_AGAIN',
          'ENOTFOUND',
        ].includes(error?.code) ||
        [408, 429, 500, 502, 503, 504].includes(status);
      if (transient && attempt < 3) {
        // Bound the pause; retries must not flood an already unhealthy source.
        // eslint-disable-next-line no-await-in-loop
        await wait(attempt * 1000);
      } else {
        let reason = timeout ? '请求超时' : '连接失败';
        if (
          [
            'ECONNRESET',
            'ECONNREFUSED',
            'EPIPE',
            'EAI_AGAIN',
            'ENOTFOUND',
          ].includes(error?.code)
        )
          reason = `连接失败 ${error.code}`;
        if (Number.isInteger(status) && status >= 400 && status < 600)
          reason = `HTTP ${status}`;
        throw new ReductionSourceError(
          `减持公告${stage}获取失败（${reason}，尝试 ${attempt} 次）`,
        );
      }
    } finally {
      retryAgent?.destroy();
    }
  }
  throw new ReductionSourceError(`减持公告${stage}获取失败`);
}
