/* eslint-disable no-await-in-loop */
import axios from 'axios';
import { shanghaiDate } from '@/modules/daily-task/sync.utils';
import { reductionState, terminalReduction } from './reduction-state';

type Notice = { id: string; code: string; date: string; title: string };
const textCache = new Map<string, { text: string; until: number }>();
let textBytes = 0;
const normalized = (text: string) =>
  text
    .replace(/\s+/g, '')
    .replace(
      /(\d{4})年(\d{1,2})月(\d{1,2})日/g,
      (_, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
    );

export function planPeriods(text: string) {
  const value = normalized(text);
  const pattern =
    /(\d{4}-\d{1,2}-\d{1,2})(?:至|到|—|－|-|～|~)(\d{4}-\d{1,2}-\d{1,2})/g;
  return [...value.matchAll(pattern)]
    .filter((match) => {
      const context = value.slice(Math.max(0, match.index! - 180), match.index);
      const periodLabel = [
        ...context.matchAll(/减持期间|减持时间|计划期间|拟减持/g),
      ].pop();
      if (!periodLabel) return false;
      const clause = context.slice(Math.max(0, periodLabel.index! - 12));
      return !/实际减持|已减持|已实施|本次减持情况/.test(clause);
    })
    .map((match) => ({ start: match[1], end: match[2] }))
    .filter(
      (period, index, all) =>
        all.findIndex(
          (p) => p.start === period.start && p.end === period.end,
        ) === index,
    );
}

export function planHolders(text: string) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /股东名称|股东姓名/.test(line));
  if (start < 0) return [];
  return [
    ...new Set(
      lines.slice(start + 1, start + 16).flatMap((line) => {
        const match = line.match(
          /^\s*([^\d%]{2,80}?)\s{2,}\d[\d,]*(?:\.\d+)?\s+/,
        );
        return match ? [match[1].replace(/\s+/g, '')] : [];
      }),
    ),
  ];
}

const fields = [
  'ts_code',
  'ann_date',
  'title',
  'url',
  'plan_start',
  'plan_end',
  'plan_status',
  'holder_names',
  'plan_id',
];

/** Index original plan announcements, never actual share-change intervals. The cache refreshes in the background. */
export async function publicReductionPlans(
  get = axios.get,
  date = shanghaiDate(),
) {
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 185);
  const since = start.toISOString().slice(0, 10);
  const notices = new Map<string, Notice>();
  const seen = new Set<string>();
  let total: number | undefined;
  for (let page = 1; page <= 100; page += 1) {
    const response = await get(
      'https://np-anotice-stock.eastmoney.com/api/security/ann',
      {
        params: {
          sr: -1,
          page_size: 100,
          page_index: page,
          ann_type: 'A',
          f_node: 7,
          begin_time: since,
          end_time: date,
          client_source: 'web',
        },
        timeout: 15000,
        maxContentLength: 4 * 1024 * 1024,
        maxRedirects: 0,
      },
    );
    const data = response.data?.data;
    if (
      !response.data?.success ||
      !Array.isArray(data?.list) ||
      Number(data.page_index) !== page ||
      !Number.isInteger(Number(data.total_hits)) ||
      Number(data.total_hits) < 0
    )
      throw new Error('减持计划公告目录不完整');
    if (total !== undefined && total !== Number(data.total_hits))
      throw new Error('计划公告目录在读取期间变化');
    total = Number(data.total_hits);
    if (total > 10000) throw new Error('计划公告目录超过核验上限');
    data.list.forEach((row: any) => {
      if (
        !/^AN\d+$/.test(row.art_code) ||
        seen.has(row.art_code) ||
        typeof row.title !== 'string' ||
        !Array.isArray(row.codes)
      )
        throw new Error('计划公告分页重复或条目无效');
      seen.add(row.art_code);
      const announced = String(row.notice_date || '').slice(0, 10);
      if (
        announced < since ||
        announced > date ||
        !/^\d{4}-\d{2}-\d{2}$/.test(announced)
      )
        throw new Error('计划公告日期超出范围');
      if (!/减持/.test(row.title)) return;
      row.codes.forEach((security: any) => {
        const code = String(security.stock_code || '');
        if (!/^[034689]\d{5}$/.test(code)) return;
        let suffix = 'SZ';
        if (/^[48]|^92/.test(code)) suffix = 'BJ';
        else if (/^6|^900/.test(code)) suffix = 'SH';
        notices.set(`${row.art_code}:${code}`, {
          id: row.art_code,
          code: `${code}.${suffix}`,
          date: announced,
          title: row.title,
        });
      });
    });
    if (seen.size === total) break;
    if (!data.list.length || seen.size > total || page === 100)
      throw new Error('减持计划公告分页缺失');
  }
  let nextRequest = 0;
  let succeeded = 0;
  let failed = 0;
  const unavailable = () => failed >= 5 && failed > succeeded / 4;
  const content = async (notice: Notice) => {
    if (unavailable()) throw new Error('计划公告来源暂不可用');
    const cached = textCache.get(notice.id);
    if (cached && cached.until > Date.now()) return cached.text;
    let text = '';
    let pages = 1;
    for (let page = 1; page <= pages; page += 1) {
      const delay = Math.max(0, nextRequest - Date.now());
      nextRequest = Math.max(nextRequest, Date.now()) + 150;
      if (delay)
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      const response = await get(
        'https://np-cnotice-stock.eastmoney.com/api/content/ann',
        {
          params: {
            art_code: notice.id,
            client_source: 'web',
            page_index: page,
          },
          timeout: 10000,
          maxContentLength: 2 * 1024 * 1024,
          maxRedirects: 0,
        },
      );
      const data = response.data?.data;
      if (
        !response.data?.success ||
        data?.art_code !== notice.id ||
        String(data.notice_date).slice(0, 10) !== notice.date ||
        typeof data.notice_content !== 'string'
      )
        throw new Error('计划公告正文无法核实');
      pages = Number(data.page_size || 1);
      if (!Number.isInteger(pages) || pages < 1 || pages > 10)
        throw new Error('计划正文分页超出上限');
      text += `${data.notice_content}\n`;
      if (text.length > 200000) throw new Error('计划正文超出上限');
    }
    const bytes = Buffer.byteLength(text);
    if (cached) textBytes -= Buffer.byteLength(cached.text);
    textCache.set(notice.id, { text, until: Date.now() + 24 * 3600000 });
    textBytes += bytes;
    while (textBytes > 8 * 1024 * 1024 || textCache.size > 2000) {
      const key = textCache.keys().next().value;
      textBytes -= Buffer.byteLength(textCache.get(key)!.text);
      textCache.delete(key);
    }
    return text;
  };
  const parallel = async <T>(
    rows: Notice[],
    fn: (notice: Notice) => Promise<T>,
  ) => {
    let cursor = 0;
    const results: T[] = [];
    await Promise.all(
      Array.from({ length: Math.min(4, rows.length) }, async () => {
        while (cursor < rows.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await fn(rows[index]);
        }
      }),
    );
    return results;
  };
  const plans = await parallel(
    [...notices.values()].filter(
      (n) =>
        /预披露|拟减持|减持.*计划|计划.*减持/.test(n.title) &&
        !terminalReduction(n.title) &&
        !/进展|实施情况|权益变动|结果|时间过半|数量过半/.test(n.title),
    ),
    async (notice) => {
      try {
        const text = await content(notice);
        succeeded += 1;
        const periods = planPeriods(text);
        return {
          ...notice,
          holders: planHolders(text),
          periods,
          textKnown: true,
        };
      } catch {
        failed += 1;
        return { ...notice, holders: [], periods: [], textKnown: false };
      }
    },
  );
  if (unavailable() || (failed && !succeeded))
    throw new Error('计划公告正文暂不可用，保留已有快照');
  const candidates = plans.filter((p) =>
    p.periods.some(
      (period) =>
        reductionState(
          { ann_date: p.date, plan_start: period.start, plan_end: period.end },
          date,
        ) === 'active',
    ),
  );
  const endings = await parallel(
    [...notices.values()].filter(
      (n) =>
        (terminalReduction(n.title) || /实施结果|减持结果/.test(n.title)) &&
        candidates.some((p) => p.code === n.code && p.date <= n.date),
    ),
    async (notice) => {
      try {
        const text = normalized(await content(notice));
        succeeded += 1;
        return { ...notice, text };
      } catch {
        failed += 1;
        return { ...notice, text: null };
      }
    },
  );
  if (unavailable()) throw new Error('后续计划状态暂不可用，保留已有快照');
  const items: any[][] = [];
  plans.forEach((plan) => {
    const periods = plan.periods.length
      ? plan.periods
      : [{ start: null, end: null }];
    periods.forEach((period) => {
      let status = reductionState(
        { ann_date: plan.date, plan_start: period.start, plan_end: period.end },
        date,
      );
      let holders = [...plan.holders];
      if (status === 'active') {
        endings
          .filter((n) => n.code === plan.code && n.date >= plan.date)
          .forEach((ending) => {
            if (!ending.text) {
              status = 'unknown';
              return;
            }
            const references = [plan.date, period.start, period.end]
              .filter(Boolean)
              .some((d) => ending.text!.includes(d!));
            const matched = holders.filter((holder) =>
              ending.text!.includes(holder),
            );
            if (references && /部分/.test(ending.title) && holders.length > 1)
              status = 'unknown';
            else if (references && holders.length && matched.length)
              holders = holders.filter((holder) => !matched.includes(holder));
            else if (references || matched.length) status = 'unknown';
            if (plan.holders.length && !holders.length) status = 'ended';
          });
      }
      // Keep future plans in the private snapshot so a cached plan becomes active on its start date.
      if (status === 'ended') return;
      items.push([
        plan.code,
        plan.date.replace(/-/g, ''),
        plan.title,
        `https://data.eastmoney.com/notices/detail/${plan.code.slice(0, 6)}/${
          plan.id
        }.html`,
        period.start,
        period.end,
        status,
        holders,
        `${plan.id}:${period.start}:${period.end}`,
      ]);
    });
  });
  return { code: 0, data: { fields, items } };
}
