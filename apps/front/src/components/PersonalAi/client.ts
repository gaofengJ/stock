import { csrfToken } from '@/auth/client';
import { withRequestDeadline } from '@/auth/request-deadline';

export type Skill = 'market-review' | 'candidate-compare';
export type ModelChoice = { model: string; effort: string };
export interface StrategyContext { type: string; parameters: Record<string, number | boolean | string>; sector?: string; keyword?: string }
export interface DataSummary { strategy: string; stocks: {code:string;name:string}[]; gaps:string[]; limitations:string[]; sources:{name:string;state:string;ms:number}[] }
export const defaultChoice: ModelChoice = { model: 'gpt-6.1-sol', effort: 'high' };
export const modelNames: Record<string, string> = { 'gpt-6.1-sol': 'GPT-6.1 Sol', 'gpt-6-astra': 'GPT-6 Astra' };
export const efforts = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export const activeTask = (status: string) => ['preparing', 'running', 'cancelling'].includes(status);
export const statusNames: Record<string, string> = {
  preparing: '准备数据', running: '正在分析', cancelling: '正在停止', completed: '已完成', failed: '执行失败', cancelled: '已取消', interrupted: '已中断',
};
export interface Metadata {
  plan: string;
  models: { model: string; efforts: string[] }[];
  checkedAt: string;
  quota: { primary?: { usedPercent: number }; secondary?: { usedPercent: number } };
}
export interface Task extends ModelChoice {
  id: string; parentId?: string; skill: Skill; date: string; codes: string[]; message: string; answer?: string;
  error?: string; stage?: string; status: string; historyTurns: number; createdAt: string;
  strategy?: StrategyContext; skillVersion?: string; contextSummary?: DataSummary;
  timings?: Record<string, number>; executionMetrics?: {firstEventMs?:number;firstAnswerMs?:number;processMs?:number};
  usage?: { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number; reasoning_output_tokens?: number };
}
export interface ConsoleState {
  enabled: boolean; capabilities?: { streaming?: boolean; reviewDocument?: boolean }; metadata: Metadata | null; tasks: Task[];
  today: { calls: number; tokens: number };
  limits: { dailyCalls: number; dailyTokens: number; maxContextBytes: number; timeoutSeconds: number };
}
export async function consoleRequest<T>(path: string, method?: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  method = method || 'GET';
  return withRequestDeadline(async (boundedSignal) => {
    const headers: Record<string, string> = {};
    if (method !== 'GET') {
      headers['X-CSRF-Token'] = await csrfToken({ signal: boundedSignal });
      headers['Content-Type'] = 'application/json';
    }
    boundedSignal.throwIfAborted();
    const response = await fetch(`/personal-ai/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: boundedSignal,
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) throw Error(response.status === 401 ? '登录已失效，请重新登录网站。' : value?.error || '暂时无法连接，请稍后重试。');
    return value;
  }, { signal, timeout: path === '/preview' ? 150000 : 40000 });
}
export function validChoice(value: unknown): value is ModelChoice {
  const choice = value as ModelChoice | null;
  return !!choice && Object.hasOwn(modelNames, choice.model) && efforts.includes(choice.effort);
}
export function readChoice(ownerId: number): ModelChoice {
  try { const value = JSON.parse(localStorage.getItem(`personal-ai-model:${ownerId}`) || 'null'); return validChoice(value) ? value : defaultChoice; } catch { return defaultChoice; }
}
export function saveChoice(ownerId: number, choice: ModelChoice) {
  if (!validChoice(choice)) throw Error('模型设置无效。');
  localStorage.setItem(`personal-ai-model:${ownerId}`, JSON.stringify(choice));
}
export function supportsChoice(metadata: Metadata | null | undefined, choice: ModelChoice) {
  return !metadata || metadata.models.some((model) => model.model === choice.model && model.efforts.includes(choice.effort));
}

export function taskGroups(tasks: Task[]): Task[][] {
  const byId = new Map(tasks.map((task) => [task.id, task])); const groups = new Map<string, Task[]>();
  tasks.forEach((task) => {
    let root = task; const visited = new Set<string>();
    while (root.parentId && byId.has(root.parentId) && !visited.has(root.parentId)) { visited.add(root.id); root = byId.get(root.parentId)!; }
    const group = groups.get(root.id) || []; group.push(task); groups.set(root.id, group);
  });
  return [...groups.values()];
}
export function strategyCaption(strategy: StrategyContext) {
  const names: Record<string, string> = {
    gapThreeUp: '缺口三连阳', gapTwoUp: '缺口二连阳', gapThreeHighTurnover: '缺口三日高换手', threeDaysHighVol: '连续三日收阳', continuousGap: '连续向上缺口', shadowWrap: '缺口上影反包', fiveMaUp: '五线顺上', volumeBreakout: '放量突破', breakoutPullback: '突破回踩',
  };
  const labels: Record<string, string> = {
    minTurnoverRateF: '最低自由流通换手率(%)', breakoutDays: '突破回看天数', volumeDays: '均量天数', volumeMultiple: '放量倍数', pullbackDays: '回踩观察天数', pullbackBelow: '下穿容差(%)', pullbackAbove: '上方容差(%)', contractionRatio: '缩量比例', fiveMaMode: '五线状态', aboveMa5: '收盘高于5日线', bullish: '当日收阳', expandingVolume: '成交量扩大',
  };
  const display = (value: string | number | boolean) => { if (typeof value === 'boolean') return value ? '是' : '否'; if (value === 'new') return '当日新形成'; if (value === 'current') return '当前满足'; return String(value); };
  const keys = strategy.type === 'fiveMaUp' ? ['fiveMaMode', 'aboveMa5', 'bullish', 'expandingVolume', ...(strategy.parameters.expandingVolume ? ['volumeDays', 'volumeMultiple'] : [])] : Object.keys(strategy.parameters);
  return `${names[strategy.type] || strategy.type}；${Object.entries(strategy.parameters).filter(([key]) => keys.includes(key)).map(([key, value]) => `${labels[key] || key}：${display(value)}`).join('，') || '默认条件'}`;
}

export function taskHref(task: Task) {
  const query = new URLSearchParams({ tab: 'history', date: task.date, aiTask: task.id });
  return `/admin/ai/?${query}`;
}
