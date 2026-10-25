import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { strategySpec } from './context.mjs';

export class Fault extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new Fault(status, message); };
export const MODELS = ['gpt-6.1-sol', 'gpt-6-astra'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export const ACTIVE = new Set(['preparing', 'running', 'cancelling']);
export const dayKey = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
export const sha = value => createHash('sha256').update(value).digest('hex');
export function cookieToken(header = '') {
  const matches = header.split(';').map(x => x.trim()).filter(x => x.startsWith('stock_session='));
  if (matches.length !== 1 || !/^stock_session=[a-f0-9]{64}$/.test(matches[0])) fail(401, '请先登录网站');
  return matches[0].slice('stock_session='.length);
}
export function checkMutation(headers, token, origin) {
  if (headers.origin !== origin) fail(403, '请求来源不匹配');
  const csrf = headers['x-csrf-token'];
  const expected = sha(`csrf:${token}`);
  if (typeof csrf !== 'string' || !/^[a-f0-9]{64}$/.test(csrf) ||
    !timingSafeEqual(Buffer.from(csrf), Buffer.from(expected))) fail(403, '安全校验失败，请刷新页面');
}
export function checkOwner(user, ownerId) {
  if (!ownerId || user?.id !== ownerId || user.mustChangePassword ||
    !user.roles?.some(r => r.code === 'admin')) fail(403, '仅指定的本人管理员账号可用');
}
export function validateTask(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) fail(400, '任务格式错误');
  const allowed = ['key', 'parentId', 'skill', 'date', 'codes', 'message', 'model', 'effort', 'strategy'];
  if (Object.keys(b).some(k => !allowed.includes(k))) fail(400, '包含未允许的参数');
  if (!/^[a-f0-9-]{36}$/.test(b.key || '')) fail(400, '缺少有效请求标识');
  if (!MODELS.includes(b.model) || !EFFORTS.includes(b.effort)) fail(400, '模型或档位不支持');
  if (!['market-review', 'candidate-compare'].includes(b.skill)) fail(400, 'Skill 不支持');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ||
    !Number.isFinite(Date.parse(b.date)) || new Date(b.date).toISOString().slice(0, 10) !== b.date || b.date > dayKey()) fail(400, '请选择有效的历史交易日期');
  if (typeof b.message !== 'string' || !b.message.trim() || b.message.length > 2000) fail(400, '问题须为1至2000字');
  if (!Array.isArray(b.codes) || b.codes.length > 3 || new Set(b.codes).size !== b.codes.length ||
    b.codes.some(x => !/^\d{6}\.(SH|SZ|BJ)$/.test(x))) fail(400, '股票代码格式错误，最多3只');
  if (b.skill === 'candidate-compare' && !b.codes.length) fail(400, '请选择至少1只股票');
  if (b.parentId && !/^[a-f0-9-]{36}$/.test(b.parentId)) fail(400, '会话标识错误');
  let strategy;
  if (b.skill === 'candidate-compare' && (!b.parentId || b.strategy)) {
    try { strategy = strategySpec(b.strategy); } catch (e) { fail(400, e.message); }
  }
  return { ...b, ...(strategy ? { strategy } : {}), message: b.message.trim() };
}
export function compactReview(raw) {
  const rows = Array.isArray(raw.items) ? raw.items : [];
  const keys = ['tsCode', 'name', 'close', 'pctChg', 'totalMv', 'circMv', 'turnoverRate', 'volumeRatio', 'capState', 'risk'];
  const selected = rows.slice(0, 12).map(row => Object.fromEntries(keys.filter(k => row[k] !== undefined).map(k => [k, row[k]])));
  return { date: raw.date, generatedAt: raw.generatedAt, complete: raw.complete, counts: raw.counts,
    strategies: raw.strategies, riskNote: raw.riskNote, total: rows.length, included: selected.length,
    omitted: Math.max(0, rows.length - selected.length), sampleRule: '现有复盘接口排序的前12项，非全市场样本', items: selected };
}
export function quotaView(raw) {
  const q = raw?.rateLimitsByLimitId?.codex || raw?.rateLimits;
  if (!q) fail(503, '无法确认订阅额度，未发起模型调用');
  return { ordinaryUsageAllowed: raw.ordinaryUsageAllowed, plan: q.planType,
    primary: q.primary || null, secondary: q.secondary || null,
    spendControlReached: q.spendControlReached === true };
}
export function requireQuota(q) {
  const windows = [q.primary, q.secondary].filter(Boolean);
  if (q.ordinaryUsageAllowed !== true || q.spendControlReached || !windows.length ||
    windows.some(w => !Number.isFinite(w.usedPercent) || w.usedPercent >= 90))
    fail(409, '订阅额度不足或无法确认，停止新任务；不切换 API、不购买额度');
}
export function parseEvent(report, event) {
  if (event.type === 'turn.completed') {
    report.completedTurns += 1;
    const u = event.usage || {};
    report.usage = Object.fromEntries(['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens']
      .map(k => [k, Number.isSafeInteger(u[k]) && u[k] >= 0 ? u[k] : null]));
  }
  if (event.type === 'item.completed' && event.item?.type === 'agent_message') report.answer = event.item.text || '';
  if (event.type === 'turn.failed' || event.type === 'error') report.failed = true;
  if (event.type === 'item.started' && ['command_execution', 'mcp_tool_call', 'web_search', 'file_change'].includes(event.item?.type))
    report.toolAttempt = true;
}
export class Store {
  constructor(dir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
    this.file = join(dir, 'tasks.json');
    try { this.tasks = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.tasks = []; }
    if (!Array.isArray(this.tasks)) throw new Error('invalid task store');
    for (const t of this.tasks) if (ACTIVE.has(t.status)) { t.status = 'interrupted'; t.error = '执行服务重启，任务未自动重试；用量可能未完整返回'; }
    this.save();
  }
  save() {
    writeFileSync(`${this.file}.new`, JSON.stringify(this.tasks), { mode: 0o600 });
    renameSync(`${this.file}.new`, this.file);
  }
  usedToday() {
    const tasks = this.tasks.filter(t => t.day === dayKey());
    return { calls: tasks.length, tokens: tasks.reduce((sum, t) => sum +
      (t.usage?.input_tokens != null && t.usage?.output_tokens != null ? t.usage.input_tokens + t.usage.output_tokens : t.reservedTokens), 0) };
  }
  admit(input, { maxCalls = 20, dailyTokens = 200000, reserve = 32000 } = {}) {
    this.tasks = this.tasks.filter(t => ACTIVE.has(t.status) || Date.parse(t.createdAt) >= Date.now() - 30 * 86400e3);
    const duplicate = this.tasks.find(t => t.key === input.key);
    if (duplicate) {
      if (duplicate.requestHash !== sha(JSON.stringify(input))) fail(409, '同一请求标识不能用于不同任务');
      return { task: duplicate, duplicate: true };
    }
    if (this.tasks.some(t => ACTIVE.has(t.status))) fail(409, '已有任务执行中，请等待或取消');
    const usage = this.usedToday();
    if (usage.calls >= maxCalls || usage.tokens + reserve > dailyTokens) fail(429, '达到每日任务或 Token 预算，今天不再启动新任务');
    let history = [], snapshot = null;
    if (input.parentId) {
      const parent = this.tasks.find(t => t.id === input.parentId);
      if (!parent || parent.status !== 'completed') fail(409, '只能追问已完成的任务');
      if (parent.snapshot?.sources?.some(s => ['market','indexes'].includes(s.name) && s.state!=='ready')) fail(409,'原记录的大盘数据读取失败，请新建分析，不能沿用不完整快照追问');
      if (input.skill==='market-review' && parent.snapshot?.version!=='review/v4') fail(409,'旧复盘缺少完整大盘上下文，请新建分析');
      if (parent.skill !== input.skill || parent.date !== input.date || JSON.stringify(parent.codes) !== JSON.stringify(input.codes)) fail(400, '追问须沿用原日期、Skill和股票范围');
      if (input.skill === 'candidate-compare' && parent.snapshot?.version !== 'candidate/v2') fail(409, '旧记录缺少完整策略上下文，请新建分析');
      if (input.strategy && JSON.stringify(input.strategy) !== JSON.stringify(parent.strategy)) fail(400, '追问不能改变策略参数，请新建分析');
      history = [...parent.history, { question: parent.message, answer: parent.answer }];
      if (history.length > 6) fail(400, '已达到6轮追问，请新建会话');
      snapshot = parent.snapshot;
    }
    const task = { ...input, id: randomUUID(), requestHash: sha(JSON.stringify(input)), day: dayKey(), createdAt: new Date().toISOString(),
      skillVersion: input.skill === 'market-review' ? 'v4' : 'v2', status: 'preparing', reservedTokens: reserve, history, snapshot, usage: null, answer: '',
      ...(input.parentId && snapshot?.strategy ? { strategy: strategySpec(snapshot.strategy.type ? { type:snapshot.strategy.type, parameters:snapshot.strategy.parameters, sector:snapshot.strategy.sector, keyword:snapshot.strategy.keyword } : input.strategy) } : {}) };
    this.tasks.push(task); this.save();
    return { task, duplicate: false };
  }
}
export function publicTask(t) {
  const { key, requestHash, history, snapshot, ...safe } = t;
  return { ...safe, historyTurns: history.length, dataDate: snapshot?.date, dataBytes: snapshot ? Buffer.byteLength(JSON.stringify(snapshot)) : 0,
    contextSummary: snapshot?.version === 'candidate/v2' ? { strategy:snapshot.strategy.name, stocks:snapshot.stocks.map(s=>({code:s.code,name:s.name})), gaps:snapshot.gaps, sources:snapshot.sources, limitations:snapshot.limitations } : ['review/v2','review/v3','review/v4'].includes(snapshot?.version) ? {strategy:'每日复盘',stocks:snapshot.items.map(s=>({code:s.code,name:s.name})),gaps:snapshot.gaps,sources:snapshot.sources,limitations:snapshot.limitations,total:snapshot.total,included:snapshot.included,omitted:snapshot.omitted}:null };
}
