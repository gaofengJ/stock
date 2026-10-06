const statusMessages: Record<number, string> = {
  400: '请求参数有误，请检查后重试',
  401: '登录状态已失效，请重新登录',
  403: '暂无操作权限，请联系管理员',
  404: '请求的服务不存在，请刷新页面后重试',
  405: '暂不支持此操作，请刷新页面后重试',
  408: '请求超时，请稍后重试',
  409: '数据状态已变化，请刷新后重试',
  413: '提交的内容过大，请缩小后重试',
  422: '填写的信息有误，请检查后重试',
  429: '操作过于频繁，请稍后重试',
  502: '暂时无法连接服务，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '服务响应超时，请稍后重试',
};

/** 所有用户可见错误均经过此边界，原始响应和技术异常不直接展示。 */
export function errorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  const e = error as { message?: unknown; code?: string; name?: string; status?: number; response?: { status?: number; data?: { message?: unknown } } } | null;
  const status = e?.response?.status || e?.status;
  if (status && status >= 500) return statusMessages[status] || '服务出现异常，请稍后重试';
  const raw = typeof error === 'string' || Array.isArray(error) ? error : e?.response?.data?.message ?? e?.message;
  if (Array.isArray(raw)) return Array.from(new Set(raw.map((item) => errorMessage(item, statusMessages[status || 0] || fallback)))).join('；') || fallback;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (/timeout|timed out/i.test(text) || ['ECONNABORTED', 'ETIMEDOUT'].includes(e?.code || '')) return '请求超时，请稍后重试';
  if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return '请求已取消';
  if (/failed to fetch|fetch failed|network\s?error|network request failed|load failed|ECONN|ENOTFOUND/i.test(text) || e?.code === 'ERR_NETWORK') return '网络连接失败，请检查网络后重试';
  if (/unexpected token|unexpected end|JSON|SyntaxError/i.test(text)) return '服务返回的数据格式异常，请稍后重试';
  // 保留中文业务提示；堆栈、页面源码和数据库错误不可混入提示。
  if (/[\u3400-\u9fff]/.test(text) && !/<[^>]+>|https?:\/\/|tushare|waditu|(?:password|token|secret|authorization|cookie)\s*[:=]|\b(?:Error|Exception|SELECT|INSERT|UPDATE|DELETE|ER_\w+|SQLSTATE)\b|\bat\s+\S+\s*\(/i.test(text)) return text;
  return statusMessages[status || 0] || fallback;
}

export function userError(error: unknown, status?: number): Error {
  return new Error(errorMessage(status ? { status, message: error } : error));
}

/** 兼容网关返回纯文本、错误页、空响应和不符合统一响应结构的内容。 */
export async function readApiResponse(response: Response) {
  let body: any;
  try {
    body = await response.json();
  } catch {
    throw userError(response.ok ? '服务返回的数据格式异常，请稍后重试' : undefined, response.status);
  }
  if (!response.ok) throw userError(body?.message, response.status);
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.code !== 'number' || !('data' in body)) {
    throw new Error('服务返回的数据格式异常，请稍后重试');
  }
  if (body.code !== 0) throw userError(body.message);
  return body;
}
