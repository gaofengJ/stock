import { MigrationInterface, QueryRunner } from 'typeorm';

export class ThsSectors1790985600000 implements MigrationInterface {
  name = 'ThsSectors1790985600000';

  async up(q: QueryRunner): Promise<void> {
    const common =
      'id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_source_ths_sector (${common},ts_code VARCHAR(16) NOT NULL,name VARCHAR(100) NOT NULL,type VARCHAR(1) NOT NULL,count INT NOT NULL,active TINYINT NOT NULL DEFAULT 1,UNIQUE KEY uq_ths_sector_code(ts_code)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_source_ths_members (${common},as_of DATE NOT NULL,ts_code VARCHAR(16) NOT NULL,members JSON NOT NULL,UNIQUE KEY uq_ths_members_date_code(as_of,ts_code)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_source_ths_daily (${common},trade_date DATE NOT NULL,ts_code VARCHAR(16) NOT NULL,data JSON NOT NULL,UNIQUE KEY uq_ths_daily_date_code(trade_date,ts_code)) ENGINE=InnoDB`,
    );
    await q.query(
      `INSERT INTO t_permission(permission_name,permission_type,action,\`desc\`,code) SELECT 'analysis:sectors','module','analysis:sectors','板块分析','analysis:sectors' WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code='analysis:sectors')`,
    );
    await q.query(
      `INSERT INTO t_role_permission(role_id,permission_id) SELECT DISTINCT old.role_id,p.id FROM t_role_permission old JOIN t_permission source ON source.id=old.permission_id AND source.code='analysis:overview' CROSS JOIN t_permission p WHERE p.code='analysis:sectors' AND NOT EXISTS (SELECT 1 FROM t_role_permission existing WHERE existing.role_id=old.role_id AND existing.permission_id=p.id)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      "DELETE rp FROM t_role_permission rp JOIN t_permission p ON p.id=rp.permission_id WHERE p.code='analysis:sectors'",
    );
    await q.query("DELETE FROM t_permission WHERE code='analysis:sectors'");
    await q.query(
      'DROP TABLE IF EXISTS t_source_ths_daily,t_source_ths_members,t_source_ths_sector',
    );
  }
}
