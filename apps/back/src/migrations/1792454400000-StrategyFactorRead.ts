import { MigrationInterface, QueryRunner } from 'typeorm';

/** Derived by MySQL on every write, including direct SQL and same-second repairs. */
export class StrategyFactorRead1792454400000 implements MigrationInterface {
  name = 'StrategyFactorRead1792454400000';

  async up(q: QueryRunner): Promise<void> {
    const additions: string[] = [];
    if (!(await q.hasColumn('t_source_strategy_factor', 'content_hash')))
      additions.push(
        'ADD COLUMN content_hash CHAR(32) GENERATED ALWAYS AS (MD5(data)) STORED',
      );
    if (!(await q.hasColumn('t_source_strategy_factor', 'packed_data')))
      additions.push(
        'ADD COLUMN packed_data MEDIUMBLOB GENERATED ALWAYS AS (COMPRESS(data)) STORED',
      );
    if (additions.length)
      await q.query(
        `ALTER TABLE t_source_strategy_factor ${additions.join(',')}`,
      );
    const indexes = await q.query(
      "SHOW INDEX FROM t_source_strategy_factor WHERE Key_name='ix_factor_version'",
    );
    if (!indexes.length)
      await q.query(
        'CREATE INDEX ix_factor_version ON t_source_strategy_factor(trade_date,updated_at,content_hash)',
      );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE t_source_strategy_factor DROP INDEX ix_factor_version, DROP COLUMN packed_data, DROP COLUMN content_hash',
    );
  }
}
