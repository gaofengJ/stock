import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeedbackRead1791936000000 implements MigrationInterface {
  name = 'FeedbackRead1791936000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_feedback_read (
      user_id INT NOT NULL,
      feedback_id INT NOT NULL,
      last_reply_id INT NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id,feedback_id),
      FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE,
      FOREIGN KEY(feedback_id) REFERENCES t_feedback(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_feedback_read');
  }
}
