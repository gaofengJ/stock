import { currentReduction } from './reduction-state';

export const RISK_CHECKLIST = [
  {
    key: 'reduction',
    label: '当前减持期间与计划核实',
    scope:
      '当前标签只计所选日仍在披露起止期间内的记录。完成、终止、过期及尚未开始不计入；公告标题和起止日期不足以证明完整的未结束计划清单。',
  },
  {
    key: 'adverse',
    label: '重大利空',
    scope: '诉讼仲裁、债务违约、立案处罚、重大经营变故；须查公告正文判断影响',
  },
  {
    key: 'financial',
    label: '财务类 ST／退市',
    scope: '利润与扣除后营收、净资产、审计意见及持续经营；按所属板块核对',
  },
  {
    key: 'governance',
    label: '规范与治理风险',
    scope: '资金占用、违规担保、内控、信息披露、账户冻结、经营停顿、治理失序',
  },
  {
    key: 'other',
    label: '其他风险警示',
    scope: '分红、财务造假及其他适用情形，核对生效时间、过渡期与豁免',
  },
  {
    key: 'delisting',
    label: '交易类／重大违法退市',
    scope:
      '股价、市值、成交量、股东人数等连续触发条件及重大违法；不能只看名称是否ST',
  },
] as const;

export function stockBoard(code: string) {
  if (code.endsWith('.BJ')) return '北交所';
  if (/^68[89]/.test(code)) return '科创板';
  if (/^30/.test(code)) return '创业板';
  return code.endsWith('.SH') ? '沪市主板' : '深市主板';
}

/** Title matches are leads, not a finding that a legal trigger has been met. */
export function announcementCategories(title: string) {
  return [
    ['reduction', /减持/],
    [
      'adverse',
      /诉讼|仲裁|违约|立案|处罚|预亏|亏损|停产|破产|重整|业绩.*(下修|修正)/,
    ],
    ['financial', /审计|持续经营|净资产|财务.*(更正|重述)/],
    ['governance', /资金占用|违规担保|内部控制|内控|冻结|无法.*履职/],
    ['other', /风险警示|分红|造假/],
    ['delisting', /退市|终止上市|重大违法/],
  ]
    .filter(([, rule]) => (rule as RegExp).test(title))
    .map(([key]) => String(key));
}

export function safeAnnouncementUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function observedRisk(
  items: Record<string, any>[],
  code: string,
  name = '',
  date = '',
) {
  const evidence = items.filter(
    (row) =>
      row.tsCode === code &&
      row.type !== '复牌' &&
      (row.type !== '减持' || currentReduction(row, date)),
  );
  const blocked =
    /ST|退/.test(name) ||
    evidence.some((row) => ['ST', '减持', '停牌'].includes(row.type));
  return {
    state: blocked ? 'excluded' : 'pending',
    label: blocked ? '已知事项排除' : '待核验',
    reasons: [
      ...new Set([
        ...evidence.map((row) => row.type),
        ...(/ST|退/.test(name) ? ['名称风险标记'] : []),
      ]),
    ],
    // A complete event feed still cannot certify absence of potential ST/adverse events.
    pending: RISK_CHECKLIST.map((row) => row.label),
  };
}
