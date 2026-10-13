import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReviewAssets1792368000000 implements MigrationInterface {
  name = 'ReviewAssets1792368000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS t_review_image (
      user_id INT NOT NULL, image_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      data MEDIUMTEXT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY(user_id,image_hash), FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    if (!(await q.hasColumn('t_review_publication', 'image_refs')))
      await q.query(
        'ALTER TABLE t_review_publication ADD COLUMN image_refs TEXT NULL',
      );
  }

  async down(q: QueryRunner): Promise<void> {
    const images = await q.query('SELECT 1 FROM t_review_image LIMIT 1');
    if (images.length)
      throw new Error(
        'Review image references are in use; roll forward or restore a verified backup instead of dropping assets',
      );
    await q.query('ALTER TABLE t_review_publication DROP COLUMN image_refs');
    await q.query('DROP TABLE t_review_image');
  }
}
