import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as dayjs from 'dayjs';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { shanghaiDate } from '@/modules/daily-task/sync.utils';
import { BasicSnapshotService } from '../basic/workbench/snapshot.service';
import {
  candidateRiskEvents,
  summarizeRiskEvents,
  RISK_LOOKBACK_DAYS,
  UNLOCK_LOOKAHEAD_DAYS,
} from './candidate-risk-rules';

@Injectable()
export class CandidateRiskService {
  constructor(
    private snapshots: BasicSnapshotService,
    private db: DataSource,
  ) {}

  async list(date: string, codes: string[], detail = false) {
    if (
      date > shanghaiDate() ||
      !codes.length ||
      codes.length > 20 ||
      (detail && codes.length !== 1)
    )
      throw new BadRequestException('风险查询日期或股票数量无效');
    const mappings = codes.some((code) => code.endsWith('.BJ'))
      ? await this.db.manager.find(BseMappingEntity)
      : [];
    const canonical = new Map(mappings.map((r) => [r.oldCode, r.newCode]));
    const aliases = (code: string) => {
      const current = canonical.get(code) || code;
      return [
        current,
        ...mappings.filter((r) => r.newCode === current).map((r) => r.oldCode),
      ];
    };
    const allCodes = [...new Set(codes.flatMap(aliases))];
    const compact = (d: string) => d.replace(/-/g, '');
    const start = compact(
      dayjs(date)
        .subtract(RISK_LOOKBACK_DAYS - 1, 'day')
        .format('YYYY-MM-DD'),
    );
    const end = compact(
      dayjs(date).add(UNLOCK_LOOKAHEAD_DAYS, 'day').format('YYYY-MM-DD'),
    );
    // Three bounded database reads. readBatch only schedules capped background fills;
    // neither this endpoint nor the candidate list waits for an external data provider.
    const [announcements, unlocks, pledges] = await Promise.all([
      this.snapshots.readBatch(
        'eastmoney_ann',
        allCodes.map((code) => ({
          ts_code: code,
          start_date: start,
          end_date: compact(date),
        })),
        'ts_code,ann_date,title,url,rec_time',
      ),
      this.snapshots.readBatch(
        'share_float',
        allCodes.map((code) => ({
          ts_code: code,
          start_date: compact(date),
          end_date: end,
        })),
      ),
      this.snapshots.readBatch(
        'pledge_stat',
        allCodes.map((code) => ({ ts_code: code })),
      ),
    ]);
    const items = codes.map((tsCode) => {
      const ids = aliases(tsCode).map((code) => allCodes.indexOf(code));
      const sources = [announcements, unlocks, pledges].flatMap((group) =>
        ids.map((i) => ({
          source: group[i].source,
          state: group[i].state,
          fetchedAt: group[i].fetchedAt,
          message: group[i].message,
          nextRetryAt: group[i].nextRetryAt,
        })),
      );
      const rows = (group: typeof announcements) =>
        ids.flatMap((i) =>
          group[i].rows
            .filter((row) => aliases(tsCode).includes(row.ts_code))
            .map((row) => ({ ...row, ts_code: tsCode })),
        );
      const events = candidateRiskEvents(
        rows(announcements),
        rows(unlocks),
        rows(pledges),
        date,
      );
      return {
        tsCode,
        tags: summarizeRiskEvents(events),
        sources,
        ...(detail ? { events } : {}),
      };
    });
    return { date, items, sources: items.flatMap((item) => item.sources) };
  }
}
