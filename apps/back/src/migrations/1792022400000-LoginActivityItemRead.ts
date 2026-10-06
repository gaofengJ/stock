import { MigrationInterface, QueryRunner } from 'typeorm';

export class LoginActivityItemRead1792022400000 implements MigrationInterface {
  name = 'LoginActivityItemRead1792022400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_auth_activity_item_read (
      user_id INT NOT NULL,
      audit_id INT NOT NULL,
      PRIMARY KEY(user_id,audit_id),
      FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE,
      FOREIGN KEY(audit_id) REFERENCES t_auth_audit(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_auth_activity_item_read');
  }
}
