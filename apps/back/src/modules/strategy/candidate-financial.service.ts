/* eslint-disable no-nested-ternary */
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { BasicSnapshotService } from '../basic/workbench/snapshot.service';
import {
  isoDate,
  latestDisclosed,
  sourceStatus,
} from '../basic/workbench/workbench.service';

// Match profile/risk fields exactly to reuse their existing financial cache.
export const CANDIDATE_FINANCIAL_FIELDS =
  'ts_code,ann_date,end_date,or_yoy,netprofit_yoy,profit_dedt,debt_to_assets,update_flag';

export function candidateProfit(rows: Record<string, any>[], date: string) {
  const report = latestDisclosed(rows, date);
  const raw = report?.profit_dedt;
  const amount =
    (typeof raw === 'number' ||
      (typeof raw === 'string' && raw.trim() !== '')) &&
    Number.isFinite(Number(raw))
      ? Number(raw)
      : null;
  return {
    status:
      amount == null
        ? 'unknown'
        : amount < 0
        ? 'loss'
        : amount > 0
        ? 'profit'
        : 'flat',
    amount,
    reportDate: report ? isoDate(report.end_date) : null,
    announcedAt: report ? isoDate(report.ann_date) : null,
  };
}

export function candidateHistory(rows: Record<string, any>[], date: string) {
  const periods = [
    ...new Set(
      rows
        .filter(
          (r) =>
            isoDate(r.ann_date) &&
            isoDate(r.ann_date) <= date &&
            isoDate(r.end_date) <= date,
        )
        .map((r) => isoDate(r.end_date)),
    ),
  ]
    .sort()
    .reverse()
    .slice(0, 3);
  return periods.map((period) =>
    candidateProfit(
      rows.filter((r) => isoDate(r.end_date) === period),
      date,
    ),
  );
}

export function candidateForecast(rows: Record<string, any>[], date: string) {
  const report = rows
    .filter((r) => isoDate(r.ann_date) && isoDate(r.ann_date) <= date)
    .sort(
      (a, b) =>
        isoDate(b.ann_date).localeCompare(isoDate(a.ann_date)) ||
        isoDate(b.end_date).localeCompare(isoDate(a.end_date)),
    )[0];
  if (!report) return null;
  const finite = (value: unknown) =>
    (typeof value === 'number' ||
      (typeof value === 'string' && value.trim() !== '')) &&
    Number.isFinite(Number(value))
      ? Number(value)
      : null;
  return {
    reportDate: isoDate(report.end_date),
    announcedAt: isoDate(report.ann_date),
    type: report.type || '未分类',
    profitMin: finite(report.net_profit_min),
    profitMax: finite(report.net_profit_max),
    changeMin: finite(report.p_change_min),
    changeMax: finite(report.p_change_max),
  };
}

@Injectable()
export class CandidateFinancialService {
  constructor(
    private snapshots: BasicSnapshotService,
    private db: DataSource,
  ) {}

  async list(date: string, codes: string[]) {
    const mappings = codes.some((code) => code.endsWith('.BJ'))
      ? await this.db.manager.find(BseMappingEntity)
      : [];
    const canonical = new Map(mappings.map((r) => [r.oldCode, r.newCode]));
    const normalized = codes.map((code) => canonical.get(code) || code);
    const unique = [...new Set(normalized)];
    const snapshots = await this.snapshots.readBatch(
      'fina_indicator',
      unique.map((code) => ({ ts_code: code })),
      CANDIDATE_FINANCIAL_FIELDS,
    );
    const forecasts = await this.snapshots.readBatch(
      'forecast',
      unique.map((code) => ({ ts_code: code })),
      'ts_code,ann_date,end_date,type,p_change_min,p_change_max,net_profit_min,net_profit_max',
    );
    const forecastByCode = new Map(
      unique.map((code, i) => [code, forecasts[i]]),
    );
    const byCode = new Map(unique.map((code, i) => [code, snapshots[i]]));
    return {
      items: codes.map((tsCode, i) => {
        const snapshot = byCode.get(normalized[i])!;
        return {
          tsCode,
          ...candidateProfit(snapshot.rows, date),
          history: candidateHistory(snapshot.rows, date),
          forecast: candidateForecast(
            forecastByCode.get(normalized[i])!.rows,
            date,
          ),
          forecastState: forecastByCode.get(normalized[i])!.state,
          forecastMessage: forecastByCode.get(normalized[i])!.message,
          sourceState: snapshot.state,
          message: snapshot.message,
          fetchedAt: snapshot.fetchedAt,
        };
      }),
      sources: sourceStatus([...snapshots, ...forecasts]),
    };
  }
}
