import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReviewNotebook1792195200000 implements MigrationInterface {
  name = 'ReviewNotebook1792195200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_review_notebook (
      user_id INT NOT NULL, trade_date VARCHAR(10) NOT NULL, revision INT NOT NULL DEFAULT 0,
      content MEDIUMTEXT NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY(user_id,trade_date), FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE IF NOT EXISTS t_review_notebook_version (
      user_id INT NOT NULL, trade_date VARCHAR(10) NOT NULL, revision INT NOT NULL,
      content MEDIUMTEXT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY(user_id,trade_date,revision), FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE IF NOT EXISTS t_review_publication (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, trade_date VARCHAR(10) NOT NULL,
      revision INT NOT NULL, channel VARCHAR(20) NOT NULL, url VARCHAR(1500) NOT NULL, body MEDIUMTEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX ix_review_publication_owner(user_id,trade_date),
      FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_review_publication');
    await q.query('DROP TABLE t_review_notebook_version');
    await q.query('DROP TABLE t_review_notebook');
  }
}
