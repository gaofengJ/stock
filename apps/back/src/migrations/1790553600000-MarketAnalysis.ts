import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketAnalysis1790553600000 implements MigrationInterface {
  transaction = false;

  async up(q: QueryRunner) {
    const common =
      'id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_source_index_daily (${common}, trade_date DATE NOT NULL, ts_code VARCHAR(16) NOT NULL, data JSON NOT NULL, UNIQUE KEY uq_index_date_code(trade_date,ts_code)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_processed_market_daily (${common}, trade_date DATE NOT NULL, scope VARCHAR(8) NOT NULL, data JSON NOT NULL, UNIQUE KEY uq_market_date_scope(trade_date,scope)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_source_bse_mapping (${common}, old_code VARCHAR(16) NOT NULL, new_code VARCHAR(16) NOT NULL, UNIQUE KEY uq_bse_old(old_code)) ENGINE=InnoDB`,
    );
    if (!(await q.hasColumn('t_admin_job', 'mode')))
      await q.query(
        "ALTER TABLE t_admin_job ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT 'refresh'",
      );
    await q.query(
      "INSERT INTO t_permission(permission_name,permission_type,action,`desc`,code) VALUES ('analysis:overview','module','analysis:overview','大盘概览','analysis:overview') ON DUPLICATE KEY UPDATE `desc`='大盘概览'",
    );
    await q.query(
      "INSERT IGNORE INTO t_role_permission(role_id,permission_id) SELECT r.id,p.id FROM t_role r JOIN t_permission p ON p.code='analysis:overview' WHERE r.code IN ('admin','user')",
    );
  }

  async down(q: QueryRunner) {
    // 回退应用时保留行情和汇总，避免丢失补齐结果。
    await q.query(
      "DELETE rp FROM t_role_permission rp JOIN t_permission p ON p.id=rp.permission_id WHERE p.code='analysis:overview'",
    );
    await q.query("DELETE FROM t_permission WHERE code='analysis:overview'");
  }
}
