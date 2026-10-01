import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketBreadth1790899200000 implements MigrationInterface {
  transaction = false;

  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE IF NOT EXISTS t_processed_market_breadth (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      trade_date DATE NOT NULL, scope VARCHAR(8) NOT NULL, data JSON NOT NULL,
      UNIQUE KEY uq_breadth_date_scope(trade_date,scope)
    ) ENGINE=InnoDB`);
  }

  async down() {
    // 回退应用仍保留已补齐的市场广度，避免重新采集。
  }
}
