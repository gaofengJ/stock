import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewsIndexQueue1792756800000 implements MigrationInterface {
  name = 'NewsIndexQueue1792756800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_index_queue (
      news_id INT NOT NULL PRIMARY KEY,
      CONSTRAINT fk_news_index_queue_item FOREIGN KEY(news_id) REFERENCES t_news_item(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    // A one-time seed repairs missing classifications and recent headline groups.
    // Steady-state collection enqueues only new or changed news in its transaction.
    await q.query(`INSERT IGNORE INTO t_news_index_queue(news_id)
      SELECT n.id FROM t_news_item n LEFT JOIN t_news_rule r ON r.news_id=n.id
      WHERE n.published_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 DAY)
      AND (r.news_id IS NULL OR n.published_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 3 DAY))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE t_news_index_queue');
  }
}
