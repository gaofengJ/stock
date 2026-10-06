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

export function riskCheckLabel(check: { key?: string; state: string; leads?: number; activeCount?: number }) {
  if (check.key === 'reduction') {
    if (check.activeCount) return `${check.activeCount}项当前减持计划`;
    if (check.leads) return `${check.leads}条计划公告待核实`;
    return check.state === 'incomplete' ? '当前减持资料不完整' : '暂无已核实的当前减持计划';
  }
  if (check.leads) return `${check.leads}条待核实线索`;
  return check.state === 'incomplete' ? '资料不完整' : '未检索到相关线索';
}

export function currentReduction(record: any, date: string) {
  const today = record.reductionDate || date;
  const start = riskDate(record.effectiveDate);
  const end = riskDate(record.endDate);
  const announcement = riskDate(record.announcementDate);
  return record.type === '减持' && record.recordKind === 'plan' && record.reductionState === 'active' && start !== '—' && end !== '—' && announcement !== '—' && announcement <= today && start <= today && today <= end;
}

export const riskTypeLabel = (type: string) => (type === '减持' ? '减持计划进行中' : type);
export const reductionStateLabel = (state: string) => ({
  active: '减持计划进行中', ended: '已结束', upcoming: '尚未开始', unknown: '期间待核实', superseded: '已有后续披露',
}[state] || '期间待核实');
export const riskRowKey = (record: any) => record.recordId || JSON.stringify([record.tsCode, record.type, record.source, record.announcementDate, record.effectiveDate, record.endDate, record.statusDate, record.detail]);
