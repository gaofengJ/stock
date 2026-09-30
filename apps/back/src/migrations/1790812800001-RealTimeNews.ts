import { MigrationInterface, QueryRunner } from 'typeorm';
import { NEWS_SOURCES } from '../modules/news/news.sources';

export class RealTimeNews1790812800001 implements MigrationInterface {
  name = 'RealTimeNews1790812800001';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_source (
      source VARCHAR(16) NOT NULL PRIMARY KEY,enabled TINYINT NOT NULL DEFAULT 1,
      interval_seconds INT NOT NULL DEFAULT 120,status VARCHAR(16) NOT NULL DEFAULT 'pending',
      last_attempt DATETIME(3) NULL,last_success DATETIME(3) NULL,next_attempt DATETIME(3) NULL,
      last_error VARCHAR(200) NOT NULL DEFAULT '',last_added INT NOT NULL DEFAULT 0,
      consecutive_failures INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_item (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,source VARCHAR(16) NOT NULL,dedupe_key CHAR(64) NOT NULL,
      kind VARCHAR(16) NOT NULL,title VARCHAR(512) NOT NULL,body TEXT NOT NULL,original_url VARCHAR(2048) NULL,
      important TINYINT NOT NULL DEFAULT 0,published_at DATETIME(3) NOT NULL,
      time_basis VARCHAR(16) NOT NULL DEFAULT 'published',
      created_at DATETIME(3) NOT NULL,updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_news_source_key(source,dedupe_key),KEY ix_news_date(published_at,id),
      KEY ix_news_source_date(source,published_at,id),KEY ix_news_important_date(important,published_at,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await q.query(`CREATE TABLE IF NOT EXISTS t_news_favorite (
      user_id INT NOT NULL,news_id INT NOT NULL,created_at DATETIME(3) NOT NULL,
      PRIMARY KEY(user_id,news_id),KEY ix_news_favorite_item(news_id),
      CONSTRAINT fk_news_favorite_user FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE,
      CONSTRAINT fk_news_favorite_item FOREIGN KEY(news_id) REFERENCES t_news_item(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    // eslint-disable-next-line no-restricted-syntax
    for (const source of NEWS_SOURCES) {
      // eslint-disable-next-line no-await-in-loop
      await q.query(
        'INSERT IGNORE INTO t_news_source(source,enabled) VALUES(?,?)',
        [source.code, source.enabled ? 1 : 0],
      );
    }
    await q.query(`INSERT INTO t_permission(permission_name,permission_type,action,\`desc\`,code)
      SELECT 'news:manage','module','news:manage','资讯来源管理','news:manage'
      WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code='news:manage')`);
    await q.query(`INSERT IGNORE INTO t_role_permission(role_id,permission_id)
      SELECT r.id,p.id FROM t_role r CROSS JOIN t_permission p WHERE r.code='admin' AND p.code='news:manage'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      "DELETE rp FROM t_role_permission rp JOIN t_permission p ON p.id=rp.permission_id WHERE p.code='news:manage'",
    );
    await q.query("DELETE FROM t_permission WHERE code='news:manage'");
    await q.query('DROP TABLE t_news_favorite');
    await q.query('DROP TABLE t_news_item');
    await q.query('DROP TABLE t_news_source');
  }
}
