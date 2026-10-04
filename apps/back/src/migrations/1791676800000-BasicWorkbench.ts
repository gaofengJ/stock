import { MigrationInterface, QueryRunner } from 'typeorm';

export class BasicWorkbench1791676800000 implements MigrationInterface {
  name = 'BasicWorkbench1791676800000';

  async up(q: QueryRunner) {
    await q.query(
      'CREATE TABLE IF NOT EXISTS t_source_basic_snapshot (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),snapshot_key VARCHAR(64) NOT NULL,source VARCHAR(32) NOT NULL,params JSON NOT NULL,data JSON NOT NULL,fetched_at DATETIME NULL,retry_at DATETIME NOT NULL,error VARCHAR(256) NULL,UNIQUE KEY uq_basic_snapshot_key(snapshot_key),KEY ix_basic_snapshot_updated(updated_at)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE t_source_stock MODIFY act_name VARCHAR(512) NULL',
    );
  }

  async down(q: QueryRunner) {
    await q.query('DROP TABLE IF EXISTS t_source_basic_snapshot');
    // Preserve expanded controller names on rollback; narrowing would truncate them.
  }
}
