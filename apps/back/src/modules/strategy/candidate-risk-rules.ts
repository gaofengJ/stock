import * as dayjs from 'dayjs';
import { compactUnlockRows } from '../basic/workbench/unlock-calendar';

export const RISK_LOOKBACK_DAYS = 180;
export const UNLOCK_LOOKAHEAD_DAYS = 30;
// An observation threshold, not an exchange rule or evidence of forced liquidation.
export const HIGH_PLEDGE_RATIO = 30;
export const riskDate = (value: unknown) =>
  String(value || '')
    .slice(0, 10)
    .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const number = (value: unknown) =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== '' &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
export interface CandidateRiskEvent {
  type: string;
  label: string;
  date: string;
  title: string;
  url?: string | null;
  detail?: string;
  kind: 'lead' | 'event' | 'statistic';
}

/** A title is a lead only. Resolutions and corrections must remain visibly distinct. */
export function announcementRiskTypes(title: string): string[] {
  const resolution =
    /澄清|不存在|不涉及|未涉及|撤销|撤回|解除|结案|履行完毕|执行完毕|和解|胜诉/.test(
      title,
    );
  const types: string[] = [];
  if (/立案|调查通知|行政处罚|处罚决定|事先告知/.test(title))
    types.push(resolution ? '立案处罚进展' : '立案处罚线索');
  if (/诉讼|仲裁/.test(title))
    types.push(resolution ? '诉讼仲裁进展' : '诉讼仲裁线索');
  if (
    /(重组|收购|资产购买|资产出售|合并)/.test(title) &&
    /(终止|取消|未获.{0,8}(通过|批准)|未通过|不予核准)/.test(title)
  ) {
    types.push(
      resolution || /终止.{0,8}审查/.test(title)
        ? '重组终止相关进展'
        : '重组终止线索',
    );
  }
  if (/违约|逾期|破产|重整|停产|停业/.test(title))
    types.push(resolution ? '经营债务进展' : '经营债务线索');
  if (/资金占用|违规担保|冻结|司法拍卖/.test(title))
    types.push(resolution ? '治理风险进展' : '治理风险线索');
  if (/预亏|首亏|亏损|业绩.{0,10}(下修|修正)|资产减值/.test(title))
    types.push(resolution ? '业绩相关进展' : '业绩风险线索');
  if (
    /风险警示|终止上市|退市|非标准.{0,4}审计|无法表示意见|否定意见/.test(title)
  )
    types.push(resolution ? '风险警示相关进展' : '风险警示线索');
  return types;
}

export function candidateRiskEvents(
  announcements: Record<string, any>[],
  unlocks: Record<string, any>[],
  pledges: Record<string, any>[],
  date: string,
) {
  const start = dayjs(date)
    .subtract(RISK_LOOKBACK_DAYS - 1, 'day')
    .format('YYYY-MM-DD');
  const end = dayjs(date)
    .add(UNLOCK_LOOKAHEAD_DAYS, 'day')
    .format('YYYY-MM-DD');
  const events: CandidateRiskEvent[] = [];
  announcements
    .filter(
      (r) =>
        riskDate(r.ann_date) >= start &&
        riskDate(r.ann_date) <= date &&
        (!r.rec_time || riskDate(r.rec_time) <= date),
    )
    .forEach((r) => {
      const title = String(r.title || '');
      const url = /^https?:\/\//.test(String(r.url || ''))
        ? String(r.url)
        : null;
      announcementRiskTypes(title).forEach((type) =>
        events.push({
          type,
          label: type,
          date: riskDate(r.ann_date),
          title,
          url,
          kind: 'lead',
        }),
      );
    });
  compactUnlockRows(
    unlocks.filter(
      (r) =>
        riskDate(r.ann_date) &&
        riskDate(r.ann_date) <= date &&
        riskDate(r.float_date) >= date &&
        riskDate(r.float_date) <= end,
    ),
  ).forEach((r) => {
    const day = riskDate(r.float_date);
    const shares = number(r.float_share);
    events.push({
      type: '解禁',
      label: `${day.slice(5)}解禁`,
      date: day,
      title: '已公告限售股解禁',
      kind: 'event',
      detail: `${
        shares === null ? '数量待核实' : `${(shares / 10000).toFixed(2)}万股`
      }${r.calendarMissing ? '（部分数量缺失）' : ''}；公告 ${riskDate(
        r.ann_date,
      )}。解禁不等于实际减持。`,
    });
  });
  const pledge = [...pledges]
    .filter((r) => riskDate(r.end_date) && riskDate(r.end_date) <= date)
    .sort((a, b) =>
      riskDate(b.end_date).localeCompare(riskDate(a.end_date)),
    )[0];
  const ratio = number(pledge?.pledge_ratio);
  if (ratio !== null && ratio >= HIGH_PLEDGE_RATIO && ratio <= 100) {
    const day = riskDate(pledge.end_date);
    const old = day < dayjs(date).subtract(30, 'day').format('YYYY-MM-DD');
    events.push({
      type: '高比例质押',
      label: `${old ? '历史' : ''}高质押 ${ratio.toFixed(1)}%`,
      date: day,
      title: '质押股份占公司总股本比例',
      kind: 'statistic',
      detail: `统计截至 ${day}，比例 ${ratio.toFixed(
        2,
      )}%。本页以 ≥${HIGH_PLEDGE_RATIO}% 提示关注，不是监管红线，不代表股东持股质押比例或已发生平仓。${
        old ? '统计距观察日超过30天，不能代表当前状态。' : ''
      }来源未提供公告时间，历史统计不作为当时已知信息的证明。`,
    });
  }
  return [
    ...new Map(
      events.map((event) => [
        JSON.stringify([event.type, event.date, event.title, event.url]),
        event,
      ]),
    ).values(),
  ];
}

export function summarizeRiskEvents(events: CandidateRiskEvent[]) {
  const grouped = new Map<string, CandidateRiskEvent[]>();
  events.forEach((event) =>
    grouped.set(event.type, [...(grouped.get(event.type) || []), event]),
  );
  return [...grouped].map(([type, rows]) => {
    const sorted = [...rows].sort((a, b) =>
      type === '解禁'
        ? a.date.localeCompare(b.date)
        : b.date.localeCompare(a.date),
    );
    return {
      type,
      label: sorted[0].label,
      count: rows.length,
      date: sorted[0].date,
      kind: sorted[0].kind,
    };
  });
}
