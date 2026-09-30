import { MigrationInterface, QueryRunner } from 'typeorm';

export class DragonPermission1790812800000 implements MigrationInterface {
  name = 'DragonPermission1790812800000';

  async up(q: QueryRunner): Promise<void> {
    await q.startTransaction();
    try {
      await q.query(`INSERT INTO t_permission(permission_name,permission_type,action,\`desc\`,code)
        SELECT 'analysis:dragon','module','analysis:dragon','龙虎榜','analysis:dragon'
        WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code='analysis:dragon')`);
      // Preserve access for roles that could already open dragon details.
      // Do not restore permissions explicitly removed from other roles.
      await q.query(`INSERT INTO t_role_permission(role_id,permission_id)
        SELECT DISTINCT old.role_id,p.id FROM t_role_permission old
        JOIN t_permission source ON source.id=old.permission_id AND source.code='analysis:limits'
        CROSS JOIN t_permission p
        WHERE p.code='analysis:dragon' AND NOT EXISTS (
          SELECT 1 FROM t_role_permission existing WHERE existing.role_id=old.role_id AND existing.permission_id=p.id
        )`);
      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE rp FROM t_role_permission rp JOIN t_permission p ON p.id=rp.permission_id WHERE p.code='analysis:dragon'`,
    );
    await q.query("DELETE FROM t_permission WHERE code='analysis:dragon'");
  }
}
