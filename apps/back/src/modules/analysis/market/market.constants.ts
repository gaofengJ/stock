export const MARKET_SCOPES = [
  'all',
  'hs',
  'main',
  'gem',
  'star',
  'bj',
] as const;
export type MarketScope = (typeof MARKET_SCOPES)[number];
export const MARKET_INDEXES = [
  { code: '000001.SH', name: '上证指数' },
  { code: '399001.SZ', name: '深证成指' },
  { code: '399006.SZ', name: '创业板指' },
  { code: '000688.SH', name: '科创50' },
  { code: '899050.BJ', name: '北证50' },
  { code: '000300.SH', name: '沪深300' },
  { code: '000905.SH', name: '中证500' },
  { code: '000852.SH', name: '中证1000' },
];

export function inScope(code: string, scope: MarketScope): boolean {
  const bj = code.endsWith('.BJ');
  const main = /^(60\d{4}\.SH|00\d{4}\.SZ)$/.test(code);
  const gem = /^30\d{4}\.SZ$/.test(code);
  const star = /^68\d{4}\.SH$/.test(code);
  if (scope === 'all') return bj || main || gem || star;
  if (scope === 'hs') return main || gem || star;
  return { bj, main, gem, star }[scope];
}
