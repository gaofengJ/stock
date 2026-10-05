import { MigrationInterface, QueryRunner } from 'typeorm';

export class PrivateFeedback1791849600000 implements MigrationInterface {
  name = 'PrivateFeedback1791849600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_feedback (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      content VARCHAR(2000) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX ix_feedback_owner_updated(user_id,updated_at,id),
      INDEX ix_feedback_updated(updated_at,id),
      FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE IF NOT EXISTS t_feedback_reply (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      feedback_id INT NOT NULL,
      user_id INT NOT NULL,
      content VARCHAR(2000) NOT NULL,
      is_admin TINYINT NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX ix_feedback_reply_thread(feedback_id,id),
      FOREIGN KEY(feedback_id) REFERENCES t_feedback(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_feedback_reply');
    await q.query('DROP TABLE t_feedback');
  }
}
