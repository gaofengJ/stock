import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewsReadingFeatures1791158400000 implements MigrationInterface {
  name = 'NewsReadingFeatures1791158400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_rule (
      news_id INT NOT NULL PRIMARY KEY,group_key CHAR(64) NOT NULL,text_hash CHAR(64) NOT NULL,
      KEY ix_news_group(group_key,news_id),
      CONSTRAINT fk_news_rule_item FOREIGN KEY(news_id) REFERENCES t_news_item(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_stock (
      news_id INT NOT NULL,ts_code VARCHAR(16) NOT NULL,PRIMARY KEY(news_id,ts_code),KEY ix_news_stock(ts_code,news_id),
      CONSTRAINT fk_news_stock_item FOREIGN KEY(news_id) REFERENCES t_news_item(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_preference (
      user_id INT NOT NULL PRIMARY KEY,keywords TEXT NOT NULL,stocks TEXT NOT NULL,
      CONSTRAINT fk_news_preference_user FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_read (
      user_id INT NOT NULL,news_id INT NOT NULL,read_at DATETIME(3) NOT NULL,PRIMARY KEY(user_id,news_id),KEY ix_news_read_item(news_id),
      CONSTRAINT fk_news_read_user FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE,
      CONSTRAINT fk_news_read_item FOREIGN KEY(news_id) REFERENCES t_news_item(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_news_read');
    await q.query('DROP TABLE t_news_preference');
    await q.query('DROP TABLE t_news_stock');
    await q.query('DROP TABLE t_news_rule');
  }
}
