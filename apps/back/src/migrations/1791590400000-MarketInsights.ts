import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketInsights1791590400000 implements MigrationInterface {
  name = 'MarketInsights1791590400000';

  async up(q: QueryRunner) {
    await q.query(
      'CREATE TABLE IF NOT EXISTS t_processed_stock_insight (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),trade_date DATE NOT NULL,revision VARCHAR(64) NOT NULL,data JSON NOT NULL,signals JSON NOT NULL,summary JSON NOT NULL,UNIQUE KEY uq_stock_insight_date(trade_date)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE IF NOT EXISTS t_source_ths_hot (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),trade_date DATE NOT NULL,data JSON NOT NULL,rank_time VARCHAR(32) NOT NULL,UNIQUE KEY uq_ths_hot_date(trade_date)) ENGINE=InnoDB',
    );
  }

  async down(q: QueryRunner) {
    await q.query('DROP TABLE IF EXISTS t_source_ths_hot');
    await q.query('DROP TABLE IF EXISTS t_processed_stock_insight');
  }
}
