import { ServiceUnavailableException } from '@nestjs/common';

/** Raw stock/limit industries use a different taxonomy and must never escape as labels. */
export function withoutSectorClassification<T>(row: T) {
  return { ...row, industry: '', industries: [], topics: [] };
}

type SectorCodeService = {
  codes: (code: string, date?: string) => Promise<Set<string>>;
};

export function sectorFilterCodes(
  service: SectorCodeService | undefined,
  code: string,
  date?: string,
): Promise<Set<string>>;
export function sectorFilterCodes(
  service: SectorCodeService | undefined,
  code?: string,
  date?: string,
): Promise<Set<string> | null>;
export function sectorFilterCodes(
  service: SectorCodeService | undefined,
  code?: string,
  date?: string,
) {
  if (!code) return Promise.resolve(null);
  if (!service) throw new ServiceUnavailableException('同花顺分类服务暂不可用');
  return service.codes(code, date);
}

export function primarySector(row: { tsCode: string; type: string }) {
  return (
    (row.type === 'I' && /^881\d{3}\.TI$/.test(row.tsCode)) ||
    (row.type === 'N' && /^88[56]\d{3}\.TI$/.test(row.tsCode))
  );
}
export function sectorReturn(
  current: number | null | undefined,
  base: number | null | undefined,
) {
  return Number.isFinite(current) &&
    Number.isFinite(base) &&
    current! > 0 &&
    base! > 0
    ? (current! / base! - 1) * 100
    : null;
}
export function competitionRanks(
  rows: { code: string; value: number | null }[],
) {
  const sorted = rows
    .filter((r) => r.value != null && Number.isFinite(r.value))
    .sort((a, b) => b.value! - a.value! || a.code.localeCompare(b.code));
  const result = new Map<string, number>();
  sorted.forEach((r, i) =>
    result.set(
      r.code,
      i && r.value === sorted[i - 1].value
        ? result.get(sorted[i - 1].code)!
        : i + 1,
    ),
  );
  return result;
}
