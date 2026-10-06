export const levelLabels: Record<string, string> = {
  error: '错误', warn: '警告', info: '信息', debug: '调试', verbose: '详细',
};
export const levelColors: Record<string, string> = { error: 'red', warn: 'orange', info: 'blue' };
export const actionLabels: Record<string, string> = {
  'auth.register': '注册账号',
  'auth.login': '登录',
  'auth.member-login': '普通用户登录通知',
  'auth.logout': '退出登录',
  'auth.password': '修改密码',
  'user.create': '创建用户',
  'user.profile': '修改个人资料',
  'user.update': '修改账号与角色',
  'user.reset-password': '重置密码',
  'role.save': '保存角色与权限',
  'role.delete': '删除角色',
  'sync.submit': '提交同步任务',
  'sync.retry': '重新排队',
  'sync.pause': '暂停任务',
  'sync.cancel': '取消任务',
  'sync.complete': '同步任务结束',
  'sync.scheduled': '自动同步',
};
export const resultLabels: Record<string, string> = {
  success: '成功',
  failed: '失败',
  started: '已开始',
  skipped: '已跳过',
  pending: '等待重试',
  queued: '等待排队',
  running: '执行中',
  interrupted: '已中断',
  paused: '已暂停',
  pausing: '正在暂停',
  cancelled: '已取消',
  cancelling: '正在取消',
};
export const moduleLabels: Record<string, string> = {
  AccessLogService: '接口访问日志写入',
  BasicSnapshotService: '基础资料缓存',
  DailyController: '个股日线',
  StockController: '股票资料',
  TradeCalController: '交易日历',
  ActiveFundsController: '活跃资金',
  SentiController: '市场情绪',
  AllExceptionsFilter: '接口异常',
  NestApplication: '服务运行',
  Catch: '服务异常',
  JobsService: '同步任务',
  DailySourceTask: '自动同步',
};

export const accessResults: Record<string, string> = {
  failed: '全部失败',
  success: '成功',
  'client-error': '请求未通过（4xx）',
  'server-error': '服务异常（5xx）',
  aborted: '连接中断',
};
export const actorLabels: Record<string, string> = { user: '登录用户', guest: '游客体验', anonymous: '未认证' };
export function accessUser(row: { actorType?: string; username?: string; nickname?: string; userId?: number }) {
  if (row.actorType !== 'user') return actorLabels[row.actorType || 'anonymous'] || '未认证';
  return row.nickname && row.nickname !== row.username ? `${row.nickname}（${row.username || `用户 #${row.userId}`}）` : row.username || `用户 #${row.userId}`;
}
export function accessStatus(row: { result: string; statusCode: number }) {
  return `${accessResults[row.result] || row.result} · ${row.statusCode}`;
}
export function durationText(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return ms < 1000 ? `${ms} 毫秒` : `${(ms / 1000).toFixed(2)} 秒`;
}
export function accessGuidance(status: number) {
  if (status === 401) return '未登录或登录状态已失效。重新登录后再试。';
  if (status === 403) return '权限或安全校验未通过。检查账号权限，或刷新页面后再试。';
  if (status === 404) return '接口地址不存在。确认页面已更新，以及请求地址是否正确。';
  if (status === 429) return '请求过于频繁，请稍后再试。';
  if (status === 499) return '客户端连接在响应完成前断开。可能是关闭页面或网络中断；写入操作需通过操作审计核对结果。';
  if (status >= 500) return '服务处理异常。点击查看同一请求的系统日志，进一步定位原因。';
  if (status >= 400) return '请求未通过。查看异常说明或关联的系统日志。';
  return '接口已正常响应。接口访问成功不代表异步同步任务已经完成，任务结果请查看执行记录。';
}
export function auditResult(action: string, result: string) {
  if (result === 'success' && action === 'sync.submit') return '已提交';
  if (result === 'success' && action === 'sync.complete') return '校验完成';
  return resultLabels[result] || result || '—';
}
export function beijingDate(value: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}
export function requestDate(timestamp?: string) {
  if (!timestamp) return beijingDate();
  if (/^\d{4}-\d{2}-\d{2} /.test(timestamp)) return timestamp.slice(0, 10);
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? beijingDate() : beijingDate(date);
}
export function accessColor(status: number) {
  if (status >= 500) return 'red';
  return status >= 400 ? 'orange' : 'green';
}
export function accessAlertType(status: number) {
  if (status >= 500) return 'error';
  return status >= 400 ? 'warning' : 'info';
}
export function beijingTime(value?: string) {
  if (!value) return '—';
  // Application log timestamps are already Shanghai wall-clock strings.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
export function auditDetail(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return auditDetail(JSON.parse(value)); } catch { return { 内容: value }; }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return value === null || value === undefined ? {} : { 内容: value };
}
export function auditTarget(action: string, target: unknown) {
  if (target === null || target === undefined || target === '') return '—';
  const text = String(target);
  if (action?.startsWith('sync.')) return `同步任务 #${text}`;
  if (action?.startsWith('role.')) return `角色 #${text}`;
  if (action?.startsWith('auth.') || action?.startsWith('user.')) return /^\d+$/.test(text) ? `用户 #${text}` : text;
  return text;
}
export function jobLink(action: string, target: unknown) {
  return action?.startsWith('sync.') && /^\d+$/.test(String(target))
    ? `/admin/sync/?job=${encodeURIComponent(String(target))}` : undefined;
}
export function logGuidance(level: string, context: string, message: string) {
  if (context === 'AllExceptionsFilter' && /\(401\)/.test(message)) return '请求未登录或会话已失效。先重新登录；若登录后持续出现，再检查登录状态。';
  if (context === 'AllExceptionsFilter' && /\(403\)/.test(message)) return '请求没有访问权限。检查该账号的角色和权限设置。';
  if (context === 'AllExceptionsFilter' && /\(404\)/.test(message)) return '请求的地址不存在。确认页面是否为最新版本，以及请求路径是否正确。';
  if (context === 'BasicSnapshotService' && message.includes('缓存写入延后')) return '基础资料缓存暂未完成写入。先稍后刷新；若持续出现，结合相邻日志检查缓存或数据库状态。';
  if (level === 'error') return '查看完整错误及相邻时间的日志；若涉及数据同步，打开对应任务确认失败原因后再处理。';
  if (level === 'warn') return '警告不一定代表任务失败。结合内容、出现频率和对应任务结果判断是否需要处理。';
  return '这是一条运行记录，可用于核对请求和服务运行过程。';
}
