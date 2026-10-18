import { sourcePending, WorkbenchSource } from './workbench-polling';

export const riskEventSources = ['stock_st', 'st', 'suspend_d', 'stk_shock', 'stk_high_shock', 'stk_alert'];

export function riskSourcesReady(sources: WorkbenchSource[], required: string[]) {
  return required.every((name) => {
    const entries = sources.filter((source) => source.source === name);
    return entries.length > 0 && entries.every((source) => source.state === 'ready');
  });
}

export function riskSectionTitle(label: string, count: number, unit: string, complete: boolean) {
  if (complete) return `${label}（${count}${unit}）`;
  return count ? `${label}（已获取${count}${unit}，资料待补全）` : `${label}（资料待补全）`;
}

export function stockReductionUnknown(data: any, code: string) {
  const coverage = data?.reductionCoverage;
  if (Array.isArray(coverage?.unknownCodes)) return coverage.unknownCodes.includes(code);
  // Older servers only expose a total. It is stock-specific only on detail responses.
  return data?.code === code && !!coverage?.unknown;
}

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
    if (check.activeCount) return `${check.activeCount}项已公告减持风险`;
    if (check.leads) return `${check.leads}条计划公告待核实`;
    return check.state === 'incomplete' ? '减持资料不完整' : '暂无已核实的待开始或进行中减持计划';
  }
  if (check.leads) return `${check.leads}条待核实线索`;
  return check.state === 'incomplete' ? '资料不完整' : '未检索到相关线索';
}

export function currentReduction(record: any, date: string) {
  const today = record.reductionDate || date;
  const start = riskDate(record.effectiveDate);
  const end = riskDate(record.endDate);
  const announcement = riskDate(record.announcementDate);
  return record.type === '减持' && record.recordKind === 'plan' && ['active', 'upcoming'].includes(record.reductionState) && start !== '—' && end !== '—' && announcement !== '—' && announcement <= today && start <= end && today <= end;
}

export const riskTypeLabel = (type: string) => (type === '减持' ? '减持风险' : type);
export const reductionStateLabel = (state: string) => ({
  active: '减持进行中', ended: '已结束', upcoming: '减持已公告，待开始', unknown: '期间待核实', superseded: '已有后续披露',
}[state] || '期间待核实');
export const reductionRiskLabel = (record: any) => `${reductionStateLabel(record.reductionState)}：${riskDate(record.effectiveDate)} 至 ${riskDate(record.endDate)}`;
export const riskRowKey = (record: any) => record.recordId || JSON.stringify([record.tsCode, record.type, record.source, record.announcementDate, record.effectiveDate, record.endDate, record.statusDate, record.detail]);
