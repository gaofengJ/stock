import { MigrationInterface, QueryRunner } from 'typeorm';

export class StrategyTrend1791331200000 implements MigrationInterface {
  name = 'StrategyTrend1791331200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE IF NOT EXISTS t_source_strategy_factor (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), trade_date DATE NOT NULL, data JSON NOT NULL, UNIQUE KEY uq_strategy_factor_date(trade_date)) ENGINE=InnoDB',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS t_source_strategy_factor');
  }
}
