import { sourcePending, WorkbenchSource } from './workbench-polling';

export function riskDate(value: unknown) {
  const text = String(value || '').slice(0, 10).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '—';
}

export function riskMissing(sources: WorkbenchSource[], source: string, stopped = false) {
  const status = sources.find((s) => s.source === source);
  if (status?.state === 'error' || status?.message) return '暂时无法获取';
  if (sourcePending(status)) return stopped ? '资料尚未就绪' : '正在获取资料';
  return status?.state === 'ready' ? '暂无截至所选日已披露的资料' : '资料尚未取得';
}

export function riskCheckLabel(check: { state: string; leads?: number }) {
  if (check.leads) return `${check.leads}条待核实线索`;
  return check.state === 'incomplete' ? '资料不完整' : '未检索到相关线索';
}
