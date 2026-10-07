import type { WorkbenchSource } from './workbench-polling';

export const sourceNames: Record<string, string> = {
  ths_hot_review: '题材与个股解析（同花顺）',
  stk_holdertrade: '股东减持',
  reduction_plans: '减持计划',
  eastmoney_ann: '公司公告',
  anns_d: '公司公告',
  fina_audit: '审计意见',
  balancesheet: '资产负债表',
  stock_company: '公司资料',
  stock_st: 'ST状态',
  st: 'ST原因',
  suspend_d: '停复牌',
  stk_shock: '异常波动',
  stk_high_shock: '严重异动',
  stk_alert: '交易所提示',
  share_float: '解禁',
  investment_calendar: '投资事件',
  eco_cal: '全球经济数据',
  cn_schedule: '国内数据发布日程',
  disclosure_date: '财报披露',
  forecast: '业绩预告',
  express: '业绩快报',
  dividend: '除权除息',
  fina_indicator: '财务指标',
  cashflow: '现金流',
  top_inst: '龙虎榜席位',
};

const beijingTime = (time: number) => {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(time));
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
};

/** Multiple requests for one kind of material form one row, with the full fetched-time range. */
export function sourceTimeRows(sources: WorkbenchSource[]) {
  const groups = new Map<string, { times: number[]; missing: boolean }>();
  sources.forEach((source) => {
    const label = sourceNames[source.source] || '其他资料';
    const group = groups.get(label) || { times: [], missing: false };
    const time = source.fetchedAt ? Date.parse(source.fetchedAt) : NaN;
    if (Number.isFinite(time)) group.times.push(time);
    else group.missing = true;
    groups.set(label, group);
  });
  return Array.from(groups, ([label, group]) => {
    if (!group.times.length) return { label, time: '尚未取得获取时间' };
    const first = beijingTime(Math.min(...group.times));
    const last = beijingTime(Math.max(...group.times));
    const range = first === last ? first : `${first} 至 ${last}`;
    return { label, time: `${range}${group.missing ? '（部分获取时间缺失）' : ''}` };
  });
}
