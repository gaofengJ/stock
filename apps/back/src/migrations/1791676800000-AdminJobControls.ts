import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminJobControls1791676800000 implements MigrationInterface {
  name = 'AdminJobControls1791676800000';

  async up(q: QueryRunner) {
    if (!(await q.hasColumn('t_admin_job', 'retry_count')))
      await q.query(
        'ALTER TABLE t_admin_job ADD retry_count INT NOT NULL DEFAULT 0',
      );
    if (!(await q.hasColumn('t_admin_job', 'next_retry_at')))
      await q.query(
        'ALTER TABLE t_admin_job ADD next_retry_at DATETIME(6) NULL',
      );
    if (!(await q.hasColumn('t_admin_job', 'last_progress_at')))
      await q.query(
        'ALTER TABLE t_admin_job ADD last_progress_at DATETIME(6) NULL',
      );
  }

  async down(q: QueryRunner) {
    await q.query(
      'ALTER TABLE t_admin_job DROP COLUMN last_progress_at, DROP COLUMN next_retry_at, DROP COLUMN retry_count',
    );
  }
}
