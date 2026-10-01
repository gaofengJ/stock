import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntradayCounts1791331200000 implements MigrationInterface {
  name = 'IntradayCounts1791331200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS t_market_intraday_counts (
        trade_date DATE NOT NULL,
        sample_time TIME NOT NULL,
        up_count INT UNSIGNED NOT NULL,
        down_count INT UNSIGNED NOT NULL,
        collected_at DATETIME(3) NOT NULL,
        PRIMARY KEY(trade_date,sample_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='财联社盘中涨跌家数'
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS t_market_intraday_counts');
  }
}
