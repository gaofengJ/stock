import { csrfToken } from '@/auth/client';

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
  id: string; skill: Skill; date: string; codes: string[]; message: string; answer?: string;
  error?: string; status: string; historyTurns: number; createdAt: string;
  strategy?: StrategyContext; skillVersion?: string; contextSummary?: DataSummary;
  timings?: Record<string, number>; executionMetrics?: {firstEventMs?:number;firstAnswerMs?:number;processMs?:number};
  usage?: { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number; reasoning_output_tokens?: number };
}
export interface ConsoleState {
  enabled: boolean; metadata: Metadata | null; tasks: Task[];
  today: { calls: number; tokens: number };
  limits: { dailyCalls: number; dailyTokens: number; maxContextBytes: number; timeoutSeconds: number };
}
export async function consoleRequest<T>(path: string, method?: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  method = method || 'GET';
  const headers: Record<string, string> = {};
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = await csrfToken();
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`/personal-ai/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal || AbortSignal.timeout(path === '/preview' ? 150000 : 40000),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw Error(response.status === 401 ? '登录已失效，请重新登录网站。' : value?.error || '暂时无法连接，请稍后重试。');
  return value;
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
