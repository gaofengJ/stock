import { ConflictException } from '@nestjs/common';

export class IncompleteFactorSnapshotError extends ConflictException {
  readonly dates: string[];

  constructor(readonly missing: { code: string; date: string }[]) {
    const samples = missing.slice(0, 5).map((row) => `${row.date} ${row.code}`);
    super(
      `策略所需复权行情缺失：${samples.join('、')}${
        missing.length > 5 ? `等${missing.length}条` : ''
      }，请补同步后重试`,
    );
    this.dates = [...new Set(missing.map((row) => row.date))].sort();
  }
}
