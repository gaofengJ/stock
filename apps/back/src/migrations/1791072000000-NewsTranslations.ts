import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewsTranslations1791072000000 implements MigrationInterface {
  name = 'NewsTranslations1791072000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_translation (
      news_id INT NOT NULL PRIMARY KEY,source_hash CHAR(64) NOT NULL,
      title VARCHAR(512) NOT NULL,body TEXT NOT NULL,
      engine VARCHAR(16) NOT NULL,model VARCHAR(32) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      CONSTRAINT fk_news_translation_item FOREIGN KEY(news_id) REFERENCES t_news_item(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_news_translation');
  }
}
