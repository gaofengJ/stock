export type ResearchRow = Record<string, any>;
export const sourceDate = (value: unknown) => {
  const date = String(value ?? '')
    .replace(/-/g, '')
    .slice(0, 8);
  return /^\d{8}$/.test(date) ? date : '';
};
export const researchNumber = (value: unknown): number | null => {
  if (
    value == null ||
    String(value).trim() === '' ||
    typeof value === 'boolean' ||
    !['number', 'string'].includes(typeof value)
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Select only records whose disclosure date is known at the observation date. */
export function disclosedRows(rows: ResearchRow[], date: string) {
  const cutoff = sourceDate(date);
  return rows.filter((row) => {
    const announced = sourceDate(row.f_ann_date || row.ann_date);
    const period = sourceDate(row.end_date);
    return announced && announced <= cutoff && (!period || period <= cutoff);
  });
}

/** Event end dates can be in the future (pledge expiry / repurchase deadline). */
export function announcedRows(rows: ResearchRow[], date: string) {
  const cutoff = sourceDate(date);
  return rows.filter(
    (row) => sourceDate(row.ann_date) && sourceDate(row.ann_date) <= cutoff,
  );
}

export function latestReportRows(rows: ResearchRow[], date: string) {
  const selected = new Map<string, ResearchRow>();
  disclosedRows(rows, date)
    .filter((r) => !r.report_type || String(r.report_type) === '1')
    .sort((a, b) => {
      const announcement = sourceDate(b.f_ann_date || b.ann_date).localeCompare(
        sourceDate(a.f_ann_date || a.ann_date),
      );
      return (
        announcement || Number(b.update_flag || 0) - Number(a.update_flag || 0)
      );
    })
    .forEach((row) => {
      const period = sourceDate(row.end_date);
      if (period && !selected.has(period)) selected.set(period, row);
    });
  return [...selected.values()].sort((a, b) =>
    sourceDate(b.end_date).localeCompare(sourceDate(a.end_date)),
  );
}

export function financialHistory(
  sources: { source: string; rows: ResearchRow[] }[],
  date: string,
) {
  const bySource = new Map(
    sources.map((s) => [
      s.source,
      new Map(
        latestReportRows(s.rows, date).map((r) => [sourceDate(r.end_date), r]),
      ),
    ]),
  );
  const income = bySource.get('income') || new Map<string, ResearchRow>();
  const indicator =
    bySource.get('fina_indicator') || new Map<string, ResearchRow>();
  const cash = bySource.get('cashflow') || new Map<string, ResearchRow>();
  const balance =
    bySource.get('balancesheet') || new Map<string, ResearchRow>();
  const periods = [
    ...new Set([
      ...income.keys(),
      ...indicator.keys(),
      ...cash.keys(),
      ...balance.keys(),
    ]),
  ]
    .sort()
    .reverse();
  return periods.map((period) => ({
    end_date: period,
    income_ann_date:
      income.get(period)?.f_ann_date || income.get(period)?.ann_date || null,
    indicator_ann_date: indicator.get(period)?.ann_date || null,
    cashflow_ann_date:
      cash.get(period)?.f_ann_date || cash.get(period)?.ann_date || null,
    revenue: researchNumber(income.get(period)?.revenue),
    n_income_attr_p: researchNumber(income.get(period)?.n_income_attr_p),
    profit_dedt: researchNumber(indicator.get(period)?.profit_dedt),
    or_yoy: researchNumber(indicator.get(period)?.or_yoy),
    netprofit_yoy: researchNumber(indicator.get(period)?.netprofit_yoy),
    roe: researchNumber(indicator.get(period)?.roe),
    grossprofit_margin: researchNumber(
      indicator.get(period)?.grossprofit_margin,
    ),
    debt_to_assets: researchNumber(indicator.get(period)?.debt_to_assets),
    n_cashflow_act: researchNumber(cash.get(period)?.n_cashflow_act),
    total_assets: researchNumber(balance.get(period)?.total_assets),
    total_liab: researchNumber(balance.get(period)?.total_liab),
    total_hldr_eqy_exc_min_int: researchNumber(
      balance.get(period)?.total_hldr_eqy_exc_min_int,
    ),
    balance_ann_date:
      balance.get(period)?.f_ann_date || balance.get(period)?.ann_date || null,
  }));
}

export function holderChanges(rows: ResearchRow[], date: string) {
  const valid = disclosedRows(rows, date);
  const periods = [...new Set(valid.map((r) => sourceDate(r.end_date)))]
    .filter(Boolean)
    .sort()
    .reverse();
  const latest = (period: string) => {
    const periodRows = valid.filter((r) => sourceDate(r.end_date) === period);
    const ann = periodRows
      .map((r) => sourceDate(r.ann_date))
      .sort()
      .pop();
    return periodRows.filter((r) => sourceDate(r.ann_date) === ann);
  };
  const current = periods[0] ? latest(periods[0]) : [];
  const previous = periods[1] ? latest(periods[1]) : [];
  const previousMap = new Map(previous.map((r) => [r.holder_name, r]));
  const currentNames = new Set(current.map((r) => r.holder_name));
  return {
    period: periods[0] || null,
    previousPeriod: periods[1] || null,
    rows: current.map((r) => {
      const before = previousMap.get(r.holder_name);
      const amount = researchNumber(r.hold_amount);
      const oldAmount = researchNumber(before?.hold_amount);
      const change =
        amount != null && oldAmount != null ? amount - oldAmount : null;
      let label = '数量不变';
      if (change != null && change < 0) label = '数量减少';
      if (change != null && change > 0) label = '数量增加';
      if (change == null) label = '变化未提供';
      if (!before) label = '新进前十';
      if (!periods[1]) label = '无可比上期';
      return {
        ...r,
        change_amount: change,
        change_label: label,
      };
    }),
    exited: previous
      .filter((r) => !currentNames.has(r.holder_name))
      .map((r) => ({ ...r, change_label: '退出前十' })),
  };
}
