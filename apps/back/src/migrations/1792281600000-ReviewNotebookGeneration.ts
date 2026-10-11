import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReviewGeneration1792281600000 implements MigrationInterface {
  name = 'ReviewGeneration1792281600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_review_notebook_state (
      user_id INT NOT NULL PRIMARY KEY, generation INT NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_review_notebook_state');
  }
}
