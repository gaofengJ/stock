import { createHash } from 'crypto';

export interface NewsStock {
  tsCode: string;
  name: string;
  fullname?: string;
}
export interface RuleCandidate {
  id: number;
  title: string;
  source: string;
  kind: string;
  published_at: Date | string;
  group_key: string;
}

export const hashText = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export function comparableTitle(title: string) {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^(?:【[^】]{1,16}】|\[[^\]]{1,16}\])\s*/, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}
const numbers = (text: string) =>
  (text.match(/\d+(?:[.,]\d+)*/g) || []).join('|');
const directions = (text: string) =>
  (
    text.match(
      /增长|下降|上涨|下跌|上调|下调|提高|降低|增持|减持|盈利|亏损|买入|卖出|暂停|恢复|否认|确认|涨停|跌停/g,
    ) || []
  )
    .sort()
    .join('|');
export function similarNews(a: string, b: string) {
  const left = comparableTitle(a);
  const right = comparableTitle(b);
  // Short generic headlines and changed financial figures must remain separate.
  if (
    left.length < 12 ||
    right.length < 12 ||
    numbers(a) !== numbers(b) ||
    directions(a) !== directions(b)
  )
    return false;
  if (left === right) return true;
  if (
    Math.min(left.length, right.length) / Math.max(left.length, right.length) <
    0.88
  )
    return false;
  const grams = (text: string) =>
    new Set(
      Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2)),
    );
  const l = grams(left);
  const r = grams(right);
  const common = [...l].filter((token) => r.has(token)).length;
  return (2 * common) / (l.size + r.size) >= 0.92;
}
export function newsGroup(item: RuleCandidate, candidates: RuleCandidate[]) {
  const time = new Date(item.published_at).getTime();
  const match = candidates.find(
    (other) =>
      other.id !== item.id &&
      other.source !== item.source &&
      other.kind === item.kind &&
      Math.abs(new Date(other.published_at).getTime() - time) <= 3 * 3600000 &&
      similarNews(item.title, other.title),
  );
  return match?.group_key || hashText(`news:${item.id}`);
}
export function matchingStocks(text: string, stocks: NewsStock[]) {
  const codes = new Set(
    (
      text.match(/(?<![\d.])\d{6}(?:\.(?:SH|SZ|BJ))?(?!\d|\.\d|[元万亿%])/gi) ||
      []
    ).map((code) => code.toUpperCase()),
  );
  return stocks
    .filter(
      (stock) =>
        codes.has(stock.tsCode) ||
        codes.has(stock.tsCode.slice(0, 6)) ||
        (stock.name.length >= 3 && text.includes(stock.name)) ||
        (stock.fullname &&
          stock.fullname.length >= 6 &&
          text.includes(stock.fullname)),
    )
    .slice(0, 50);
}
