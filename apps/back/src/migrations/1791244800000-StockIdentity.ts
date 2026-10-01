import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockIdentity1791244800000 implements MigrationInterface {
  name = 'StockIdentity1791244800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE IF NOT EXISTS t_source_stock_history (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), snapshot_key VARCHAR(16) NOT NULL, as_of DATE NOT NULL, data JSON NOT NULL, UNIQUE KEY uq_stock_history_key(snapshot_key)) ENGINE=InnoDB',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS t_source_stock_history');
  }
}
