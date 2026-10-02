import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntradayCountsSource1791504000001 implements MigrationInterface {
  name = 'IntradayCountsSource1791504000001';

  async up(q: QueryRunner): Promise<void> {
    const [column] = await q.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_market_intraday_counts' AND COLUMN_NAME='source'",
    );
    if (!column)
      await q.query(
        "ALTER TABLE t_market_intraday_counts ADD source VARCHAR(16) NOT NULL DEFAULT 'cls' COMMENT 'cls实时采集/history_5m历史重建'",
      );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE t_market_intraday_counts DROP COLUMN source');
  }
}
