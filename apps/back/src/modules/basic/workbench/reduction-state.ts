export type ReductionState =
  | 'active'
  | 'upcoming'
  | 'ended'
  | 'unknown'
  | 'superseded';

export const terminalReduction = (value: unknown) =>
  /完成|完毕|终止|取消|届满|结束/.test(
    String(value || '').replace(/未完成|尚未完成|部分完成|未终止|未结束/g, ''),
  );

const dateValue = (value: unknown) => {
  const text = String(value || '')
    .slice(0, 10)
    .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === text
    ? text
    : null;
};

/** Unknown dates are never evidence of an ongoing period; historical disclosure bounds still apply. */
export function reductionState(
  record: Record<string, any>,
  date: string,
): ReductionState {
  const announcement = dateValue(record.ann_date || record.announcementDate);
  const start = dateValue(record.begin_date || record.effectiveDate);
  const end = dateValue(record.close_date || record.endDate);
  const terminal = terminalReduction(record.plan_status || record.planStatus);
  if (!announcement || announcement > date) return 'unknown';
  if (terminal || (end && end < date)) return 'ended';
  if (!start || !end || start > end) return 'unknown';
  return start > date ? 'upcoming' : 'active';
}

export function currentReduction(record: Record<string, any>, date: string) {
  return (
    record.type === '减持' &&
    record.reductionState === 'active' &&
    reductionState(record, date) === 'active'
  );
}

/** A later disclosure for the same holder/period supersedes the old interval, not other holders' plans. */
export function latestReductionRecords(records: Record<string, any>[]) {
  const latest = new Map<string, Record<string, any>>();
  const keyFor = (record: Record<string, any>) =>
    JSON.stringify([
      record.tsCode,
      String(record.holderName).normalize('NFKC').replace(/\s+/g, ''),
      record.effectiveDate,
    ]);
  records.forEach((record) => {
    if (!record.holderName || !dateValue(record.effectiveDate)) return;
    const key = keyFor(record);
    const previous = latest.get(key);
    if (
      !previous ||
      record.announcementDate > previous.announcementDate ||
      (record.announcementDate === previous.announcementDate &&
        record.reductionState === 'ended' &&
        previous.reductionState !== 'ended')
    )
      latest.set(key, record);
  });
  return records.map((record) => {
    if (!record.holderName || !dateValue(record.effectiveDate)) return record;
    const last = latest.get(keyFor(record))!;
    return record.announcementDate === last.announcementDate &&
      record.endDate === last.endDate &&
      record.reductionState === last.reductionState
      ? record
      : { ...record, reductionState: 'superseded' };
  });
}
