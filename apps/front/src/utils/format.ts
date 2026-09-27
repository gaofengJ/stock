/** Display formatting only: keep source values unchanged for calculation and sorting. */
export function finiteNumber(value: unknown): number | null {
  if (value == null || typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function numberText(value: unknown, digits = 2, signed = false): string {
  const number = finiteNumber(value);
  if (number == null) return '—';
  const options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  const zero = (0).toLocaleString('zh-CN', options);
  const text = number.toLocaleString('zh-CN', options);
  // Let Intl round the original value once (e.g. 1.005 -> 1.01).
  if (text === `-${zero}` || text === zero) return zero;
  return `${signed && number > 0 ? '+' : ''}${text}`;
}

export function scaledNumber(value: unknown, divisor: number, digits = 2): string {
  const number = finiteNumber(value);
  return numberText(number == null ? null : number / divisor, digits);
}

export function changeClass(value: unknown): string {
  const number = finiteNumber(value);
  if (number == null || numberText(number) === '0.00') return 'quote-flat';
  return number > 0 ? 'quote-up' : 'quote-down';
}

export function beijingTime(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date).replaceAll('/', '-');
}
