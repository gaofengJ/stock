/* eslint-disable no-await-in-loop, no-restricted-syntax -- Backfill in bounded batches, preserving previously assigned avatars. */
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { randomAvatar } from '../modules/auth/avatar';

export class AccountAvatars1790467200001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('t_user', 'avatar'))) {
      await q.addColumn(
        't_user',
        new TableColumn({
          name: 'avatar',
          type: 'varchar',
          length: '32',
          isNullable: true,
        }),
      );
    }
    let rows = await q.query(
      "SELECT id FROM t_user WHERE avatar IS NULL OR avatar='' LIMIT 500",
    );
    while (rows.length) {
      for (const row of rows) {
        await q.query(
          "UPDATE t_user SET avatar=? WHERE id=? AND (avatar IS NULL OR avatar='')",
          [randomAvatar(), row.id],
        );
      }
      rows = await q.query(
        "SELECT id FROM t_user WHERE avatar IS NULL OR avatar='' LIMIT 500",
      );
    }
  }

  async down(): Promise<void> {
    throw new Error(
      'Avatar assignments must be preserved; use a reviewed backup to roll back.',
    );
  }
}
