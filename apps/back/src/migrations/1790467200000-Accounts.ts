/* eslint-disable no-restricted-syntax, no-await-in-loop -- Ordered database operations and bounded streams must execute sequentially. */
import { MigrationInterface, QueryRunner } from 'typeorm';
import { PERMISSIONS, DEFAULT_PERMISSIONS } from '../modules/auth/permissions';

const INITIAL_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$kIjtTzH4gOyGADyr+yz53w$3WEw2t72ImG4Gi+kJ2gxxRKlDivQumsBjEupATzHkvA';
const common =
  'id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';
export class Accounts1790467200000 implements MigrationInterface {
  transaction = false;

  async preflight(q: QueryRunner) {
    // Validate old records before any schema changes. Never silently grant an existing user admin.
    if (await q.hasTable('t_user')) {
      const duplicates = await q.query(
        'SELECT LOWER(TRIM(username)) name, COUNT(*) n FROM t_user GROUP BY LOWER(TRIM(username)) HAVING n > 1',
      );
      if (duplicates.length)
        throw new Error('Account migration: duplicate normalized usernames');
      const existing = await q.query(
        "SELECT id FROM t_user WHERE LOWER(TRIM(username))='mufeng'",
      );
      const bootstrapped = (await q.hasTable('t_auth_meta'))
        ? await q.query(
            "SELECT name FROM t_auth_meta WHERE name='bootstrap-v1'",
          )
        : [];
      if (existing.length && !bootstrapped.length)
        throw new Error(
          'Account migration: reserved username mufeng already exists; resolve ownership before migration',
        );
    }
    for (const [table, left, right, lt, rt] of [
      ['t_user_role', 'user_id', 'role_id', 't_user', 't_role'],
      [
        't_role_permission',
        'role_id',
        'permission_id',
        't_role',
        't_permission',
      ],
    ]) {
      if (await q.hasTable(table)) {
        if (!(await q.hasTable(lt)) || !(await q.hasTable(rt)))
          throw new Error('Account migration: missing referenced table');
        const invalid = await q.query(
          `SELECT a.id FROM ${table} a LEFT JOIN ${lt} l ON l.id=a.${left} LEFT JOIN ${rt} r ON r.id=a.${right} WHERE l.id IS NULL OR r.id IS NULL LIMIT 1`,
        );
        const duplicate = await q.query(
          `SELECT ${left},${right} FROM ${table} GROUP BY ${left},${right} HAVING COUNT(*)>1 LIMIT 1`,
        );
        if (invalid.length || duplicate.length)
          throw new Error(
            `Account migration: invalid or duplicate associations in ${table}`,
          );
      }
    }
  }

  async up(q: QueryRunner) {
    await this.preflight(q);
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_user (${common}, username VARCHAR(64) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, email VARCHAR(255) NULL UNIQUE, phone VARCHAR(20) NULL UNIQUE, is_active TINYINT NOT NULL DEFAULT 1, point INT NOT NULL DEFAULT 0, last_login TIMESTAMP NULL)`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_role (${common}, role_name VARCHAR(64) NOT NULL UNIQUE, \`desc\` VARCHAR(64) NOT NULL DEFAULT '')`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_permission (${common}, permission_name VARCHAR(64) NOT NULL UNIQUE, permission_type VARCHAR(64) NOT NULL, action VARCHAR(255) NOT NULL, \`desc\` VARCHAR(1024) NULL)`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_user_role (${common}, user_id INT NOT NULL, role_id INT NOT NULL)`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_role_permission (${common}, role_id INT NOT NULL, permission_id INT NOT NULL)`,
    );
    for (const [table, name, definition] of [
      ['t_user', 'nickname', "VARCHAR(40) NOT NULL DEFAULT ''"],
      ['t_user', 'must_change_password', 'TINYINT NOT NULL DEFAULT 0'],
      ['t_role', 'code', 'VARCHAR(64) NULL'],
      ['t_role', 'builtin', 'TINYINT NOT NULL DEFAULT 0'],
      ['t_permission', 'code', 'VARCHAR(64) NULL'],
    ])
      if (!(await q.hasColumn(table, name)))
        await q.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    await q.query('ALTER TABLE t_user MODIFY password VARCHAR(255) NOT NULL');
    await q.query('UPDATE t_user SET username=LOWER(TRIM(username))');
    await q.query(
      "UPDATE t_user SET password='', must_change_password=1 WHERE password NOT LIKE '$argon2id$%'",
    );
    await q.query(
      "UPDATE t_role SET code=CONCAT('legacy_',id) WHERE code IS NULL",
    );
    await q.query(
      "UPDATE t_permission SET code=CONCAT('legacy_',id) WHERE code IS NULL",
    );
    for (const [table, index, fields] of [
      ['t_role', 'uq_role_code', 'code'],
      ['t_permission', 'uq_permission_code', 'code'],
      ['t_user_role', 'uq_user_role', 'user_id,role_id'],
      ['t_role_permission', 'uq_role_permission', 'role_id,permission_id'],
    ]) {
      const indexes = await q.query(
        'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',
        [table, index],
      );
      if (!indexes.length)
        await q.query(
          `ALTER TABLE ${table} ADD UNIQUE INDEX ${index} (${fields})`,
        );
    }
    for (const [table, field, target] of [
      ['t_user_role', 'user_id', 't_user'],
      ['t_user_role', 'role_id', 't_role'],
      ['t_role_permission', 'role_id', 't_role'],
      ['t_role_permission', 'permission_id', 't_permission'],
    ]) {
      await q.query(`ALTER TABLE ${table} MODIFY ${field} INT NOT NULL`);
      const name = `fk_${table}_${field}`;
      const keys = await q.query(
        'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?',
        [table, name],
      );
      if (!keys.length)
        await q.query(
          `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${field}) REFERENCES ${target}(id) ON DELETE RESTRICT`,
        );
    }
    await q.query(
      'CREATE TABLE IF NOT EXISTS t_auth_meta (name VARCHAR(64) PRIMARY KEY)',
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_auth_session (${common}, user_id INT NULL, token_hash CHAR(64) NOT NULL UNIQUE, csrf_hash CHAR(64) NOT NULL, last_seen_at DATETIME(6) NOT NULL, expires_at DATETIME(6) NOT NULL, revoked_at DATETIME(6) NULL, INDEX ix_session_user(user_id), INDEX ix_session_expiry(expires_at), FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_user_identity (${common}, user_id INT NOT NULL, provider VARCHAR(32) NOT NULL, app_id VARCHAR(128) NOT NULL, subject VARCHAR(191) NOT NULL, union_id VARCHAR(191) NULL, UNIQUE KEY uq_identity(provider,app_id,subject), FOREIGN KEY(user_id) REFERENCES t_user(id) ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_auth_audit (${common}, actor_id INT NULL, actor_name VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, target VARCHAR(128) NULL, result VARCHAR(16) NOT NULL, detail TEXT NULL, INDEX ix_audit_time(created_at), INDEX ix_audit_actor(actor_id))`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_admin_job (${common}, actor_id INT NULL, actor_name VARCHAR(64) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, status VARCHAR(24) NOT NULL, active_key VARCHAR(64) NULL UNIQUE, stage VARCHAR(255) NOT NULL DEFAULT '', completed_dates JSON NULL, started_at DATETIME(6) NULL, finished_at DATETIME(6) NULL, error TEXT NULL, INDEX ix_job_status(status), INDEX ix_job_created(created_at))`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS t_sync_run (${common}, task VARCHAR(32) NOT NULL, trade_date DATE NOT NULL, status VARCHAR(16) NOT NULL, attempts INT NOT NULL DEFAULT 0, daily_count INT NOT NULL DEFAULT 0, limit_count INT NOT NULL DEFAULT 0, senti_count INT NOT NULL DEFAULT 0, error TEXT NULL, UNIQUE KEY uq_sync_task_date(task,trade_date))`,
    );
    await q.startTransaction();
    try {
      const boot = await q.query(
        "SELECT name FROM t_auth_meta WHERE name='bootstrap-v1' FOR UPDATE",
      );
      if (!boot.length) {
        await q.query(
          "INSERT INTO t_role(role_name,`desc`,code,builtin) VALUES ('系统管理员','系统内置管理员','admin',1),('普通用户','注册用户默认角色','user',1)",
        );
        for (const p of PERMISSIONS)
          await q.query(
            'INSERT INTO t_permission(permission_name,permission_type,action,`desc`,code) VALUES (?,?,?,?,?)',
            [p.code, p.route ? 'module' : 'action', p.code, p.name, p.code],
          );
        await q.query(
          "INSERT INTO t_role_permission(role_id,permission_id) SELECT r.id,p.id FROM t_role r CROSS JOIN t_permission p WHERE r.code='admin' AND p.code NOT LIKE 'legacy_%'",
        );
        for (const code of DEFAULT_PERMISSIONS)
          await q.query(
            "INSERT INTO t_role_permission(role_id,permission_id) SELECT r.id,p.id FROM t_role r CROSS JOIN t_permission p WHERE r.code='user' AND p.code=?",
            [code],
          );
        const created = await q.query(
          "INSERT INTO t_user(username,password,nickname) VALUES ('mufeng',?,'木风')",
          [INITIAL_HASH],
        );
        await q.query(
          "INSERT INTO t_user_role(user_id,role_id) SELECT ?,id FROM t_role WHERE code='admin'",
          [created.insertId],
        );
        await q.query("INSERT INTO t_auth_meta(name) VALUES ('bootstrap-v1')");
      }
      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }
  }

  async down(): Promise<void> {
    throw new Error(
      'Account migration is forward-only; restore a verified backup during a maintenance window.',
    );
  }
}
