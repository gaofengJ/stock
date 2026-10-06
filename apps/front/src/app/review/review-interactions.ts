export interface HoldingInput { id: number; code: string; boughtOn?: string; cost?: number; rationale?: string }
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function holdingErrors(rows: HoldingInput[], date: string) {
  const codeError = (row: HoldingInput, index: number) => {
    if (!/^\d{6}\.(SH|SZ|BJ)$/.test(row.code)) return '请输入完整代码，例如 000001.SZ';
    return rows.some((r, i) => i !== index && r.code === row.code) ? '股票代码重复，请修改或移除' : '';
  };
  return rows.map((row, index) => ({
    code: codeError(row, index),
    boughtOn: row.boughtOn && (!validDate(row.boughtOn) || row.boughtOn > date) ? '买入日期不能晚于复盘日期' : '',
    cost: row.cost !== undefined && (!Number.isFinite(row.cost) || row.cost <= 0 || row.cost > 1000000) ? '成本需大于0且不超过100万元／股' : '',
  }));
}
export function compareCap(a: number | null | undefined, b: number | null | undefined) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return a - b;
}
