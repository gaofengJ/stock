import { LimitEntity } from '@/modules/source/limit/limit.entity';

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
export const reviewDate = (value: unknown) =>
  text(value)
    .slice(0, 10)
    .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
export const reviewNumber = (value: unknown): number | null =>
  value == null || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);
const labels = (value: unknown) => [
  ...new Set(
    text(value)
      .split(/[、,，;；+\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

export function validateReviewRows(rows: Record<string, any>[], date: string) {
  const seen = new Set<string>();
  rows.forEach((row) => {
    if (
      !/^\d{6}\.(SH|SZ|BJ)$/.test(row.ts_code) ||
      reviewDate(row.trade_date) !== date ||
      seen.has(row.ts_code)
    )
      throw new Error('题材来源日期或股票记录异常');
    seen.add(row.ts_code);
  });
}

/** One stock belongs to the source's first theme; additional themes remain visible as labels. */
export function buildThemeReview(
  stocks: LimitEntity[],
  rows: Record<string, any>[],
  date: string,
) {
  validateReviewRows(rows, date);
  const byCode = new Map(rows.map((row) => [row.ts_code, row]));
  const items = stocks.map((stock) => {
    const source = byCode.get(stock.tsCode);
    const themes = labels(source?.theme);
    const reason = text(source?.lu_desc);
    return {
      ...stock,
      theme: themes[0] || '题材待补充',
      themes,
      reason: reason || null,
      keywords: labels(reason),
      sourceStatus: text(source?.status) || null,
    };
  });
  const groups = [...new Set(items.map((r) => r.theme))]
    .map((name) => {
      const members = items
        .filter((r) => r.theme === name)
        .sort(
          (a, b) =>
            (b.limitTimes || 0) - (a.limitTimes || 0) ||
            (a.lastTime || '99').localeCompare(b.lastTime || '99') ||
            a.tsCode.localeCompare(b.tsCode),
        );
      const counts = new Map<string, number>();
      members.forEach((r) =>
        r.keywords.forEach((word) =>
          counts.set(word, (counts.get(word) || 0) + 1),
        ),
      );
      const amounts = members
        .map((r) => reviewNumber(r.amount))
        .filter((v): v is number => v !== null);
      return {
        name,
        count: members.length,
        maxHeight: Math.max(...members.map((r) => r.limitTimes || 0)),
        amount: amounts.length ? amounts.reduce((sum, v) => sum + v, 0) : null,
        keywords: [...counts]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
          .slice(0, 6)
          .map(([word]) => word),
        items: members,
      };
    })
    .sort(
      (a, b) =>
        Number(a.name === '题材待补充') - Number(b.name === '题材待补充') ||
        b.count - a.count ||
        b.maxHeight - a.maxHeight ||
        a.name.localeCompare(b.name, 'zh-CN'),
    );
  return {
    groups,
    total: items.length,
    explained: items.filter((r) => r.reason).length,
    classified: items.filter((r) => r.themes.length).length,
  };
}

export function reviewAnnouncements(
  rows: Record<string, any>[],
  code: string,
  start: string,
  date: string,
) {
  const seen = new Set<string>();
  return rows
    .filter(
      (r) =>
        r.ts_code === code &&
        reviewDate(r.ann_date) >= start &&
        reviewDate(r.ann_date) <= date &&
        (!r.rec_time || reviewDate(r.rec_time) <= date),
    )
    .map((r) => {
      let url: string | null = null;
      try {
        const parsed = new URL(r.url);
        if (['http:', 'https:'].includes(parsed.protocol)) url = parsed.href;
      } catch {
        /* Missing source link remains plain text. */
      }
      return { date: reviewDate(r.ann_date), title: text(r.title), url };
    })
    .filter((r) => {
      const key = `${r.date}:${r.title}`;
      if (!r.title || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-CN'),
    );
}
