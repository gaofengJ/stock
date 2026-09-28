import { MigrationInterface, QueryRunner } from 'typeorm';

export class LoginActivity1790640000000 implements MigrationInterface {
  name = 'LoginActivity1790640000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_auth_activity_read (
      user_id INT NOT NULL PRIMARY KEY,
      last_read_id INT NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    const rows = await q.query(
      "SHOW INDEX FROM t_auth_audit WHERE Key_name='ix_audit_action_id'",
    );
    if (!rows.length)
      await q.query(
        'ALTER TABLE t_auth_audit ADD INDEX ix_audit_action_id(action,id)',
      );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_auth_activity_read');
    await q.query('ALTER TABLE t_auth_audit DROP INDEX ix_audit_action_id');
  }
}
