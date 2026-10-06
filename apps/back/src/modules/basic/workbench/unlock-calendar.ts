/** A calendar needs stock/day totals, rather than thousands of individual holders. */
export function compactUnlockRows(rows: Record<string, any>[]) {
  const groups = new Map<string, Map<string, Record<string, any>>>();
  rows.forEach((row) => {
    const key = `${row.ts_code}:${row.float_date}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const holders = groups.get(key)!;
    const holder = JSON.stringify([row.holder_name, row.share_type]);
    const old = holders.get(holder);
    if (!old || String(row.ann_date || '') > String(old.ann_date || ''))
      holders.set(holder, row);
  });
  return [...groups.values()].map((holders) => {
    const records = [...holders.values()];
    const known = records.filter(
      (r) => r.float_share != null && Number.isFinite(Number(r.float_share)),
    );
    return {
      ts_code: records[0].ts_code,
      float_date: records[0].float_date,
      ann_date: records
        .map((r) => String(r.ann_date || ''))
        .sort()
        .reverse()[0],
      float_share: known.length
        ? known.reduce((sum, r) => sum + Number(r.float_share), 0)
        : null,
      share_type: [
        ...new Set(records.map((r) => r.share_type).filter(Boolean)),
      ].join('、'),
      calendarCount: records.length,
      calendarMissing: records.length - known.length,
    };
  });
}
