import axios from 'axios';

/** Only controlled diagnostic text may be returned to clients; never include request URLs or headers. */
export class ReductionSourceError extends Error {}

export async function reductionRequest(
  get: typeof axios.get,
  url: string,
  config: Parameters<typeof axios.get>[1],
  stage: '目录' | '正文',
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await get(url, config);
    } catch (error) {
      const status = Number(error?.response?.status);
      const timeout = ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code);
      const transient =
        timeout ||
        ['ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND'].includes(error?.code) ||
        [408, 429, 500, 502, 503, 504].includes(status);
      if (transient && attempt < 3) {
        // Bound the pause; retries must not flood an already unhealthy source.
        // eslint-disable-next-line no-await-in-loop
        await wait(attempt * 1000);
      } else {
        let reason = timeout ? '请求超时' : '连接失败';
        if (Number.isInteger(status) && status >= 400 && status < 600)
          reason = `HTTP ${status}`;
        throw new ReductionSourceError(
          `减持公告${stage}获取失败（${reason}，尝试 ${attempt} 次）`,
        );
      }
    }
  }
  throw new ReductionSourceError(`减持公告${stage}获取失败`);
}
