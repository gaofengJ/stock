import { MigrationInterface, QueryRunner } from 'typeorm';

/** Resume only the automatic job stopped by the empty-criteria regression. */
export class RecoverSectorCatalog1792108800000 implements MigrationInterface {
  name = 'RecoverSectorCatalog1792108800000';

  async up(q: QueryRunner) {
    const [latest] = await q.query(
      "SELECT id,status,error FROM t_admin_job WHERE mode='sector' ORDER BY id DESC LIMIT 1",
    );
    if (
      !latest ||
      latest.status !== 'failed' ||
      !String(latest.error).startsWith(
        'Empty criteria(s) are not allowed for the update method.',
      )
    )
      return;
    const [active] = await q.query(
      "SELECT id FROM t_admin_job WHERE mode='sector' AND active_key IS NOT NULL LIMIT 1",
    );
    if (active) return;
    await q.query(
      "UPDATE t_admin_job SET status='queued',stage='目录更新已修复，继续补齐',retry_count=0,next_retry_at=NULL,finished_at=NULL,error=NULL,active_key='ths-sectors-two-years' WHERE id=? AND actor_id IS NULL AND status='failed'",
      [latest.id],
    );
  }

  async down() {
    // Never undo a resumed job or its completed data.
  }
}
