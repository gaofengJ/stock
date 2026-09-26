require('reflect-metadata');
const assert = require('node:assert/strict');
const { DataSource } = require('typeorm');
const { Accounts1790467200000 } = require('../dist/migrations/1790467200000-Accounts');
async function main() {
  const database = process.env.AUTH_TEST_DATABASE;
  assert.match(database || '', /^stock_auth_test_[a-z0-9_]+$/);
  const opts = { type: 'mysql', host: '127.0.0.1', port: Number(process.env.AUTH_TEST_PORT || 33387), username: process.env.AUTH_TEST_USER || 'root', password: process.env.AUTH_TEST_PASSWORD || '', logging: false };
  const server = await new DataSource(opts).initialize();
  const existing = await server.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [database]);
  assert.equal(existing.length, 0, 'Use a new disposable database');
  await server.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4');
  const db = await new DataSource({ ...opts, database, entities: ['dist/modules/user/entities/*.js', 'dist/modules/role/entities/*.js', 'dist/modules/permission/entities/*.js'], synchronize: true }).initialize();
  const q = db.createQueryRunner();
  const migration = new Accounts1790467200000();
  try {
    await db.query('ALTER TABLE t_user MODIFY username VARCHAR(64) COLLATE utf8mb4_bin NOT NULL, MODIFY password VARCHAR(32) NOT NULL');
    await db.query("INSERT INTO t_user(username,password) VALUES ('legacyuser','unsupported-format'),('LegacyUser','unsupported-format')");
    await assert.rejects(migration.up(q), /duplicate normalized usernames/);
    assert.equal(await q.hasTable('t_auth_meta'), false);
    await db.query("DELETE FROM t_user WHERE username='LegacyUser'");
    await db.query("INSERT INTO t_user(username,password) VALUES ('mufeng','unsupported-format')");
    await assert.rejects(migration.up(q), /reserved username/);
    await db.query("DELETE FROM t_user WHERE username='mufeng'");
    const role = await db.query("INSERT INTO t_role(role_name,\`desc\`) VALUES ('legacy role','kept')");
    const [user] = await db.query("SELECT id FROM t_user WHERE username='legacyuser'");
    await db.query('INSERT INTO t_user_role(user_id,role_id) VALUES (?,?)', [user.id, 99999]);
    await assert.rejects(migration.up(q), /invalid or duplicate associations/);
    await db.query('DELETE FROM t_user_role');
    await db.query('INSERT INTO t_user_role(user_id,role_id) VALUES (?,?),(?,?)', [user.id,role.insertId,user.id,role.insertId]);
    await assert.rejects(migration.up(q), /invalid or duplicate associations/);
    await db.query('DELETE FROM t_user_role LIMIT 1');
    await migration.up(q);
    const [preserved] = await db.query('SELECT username,password,must_change_password FROM t_user WHERE id=?', [user.id]);
    assert.equal(preserved.username, 'legacyuser'); assert.equal(preserved.password, ''); assert.equal(preserved.must_change_password, 1);
    assert.equal((await db.query('SELECT role_id FROM t_user_role WHERE user_id=?', [user.id]))[0].role_id, role.insertId);
    await migration.up(q);
    assert.equal(Number((await db.query("SELECT COUNT(*) n FROM t_user WHERE username='mufeng'"))[0].n), 1);
    console.info('PASS: real legacy schema, duplicate names, reserved admin conflict, invalid references, duplicate joins, preserved accounts and associations, credential invalidation, repeated migration.');
  } finally { await q.release(); await db.destroy(); await server.query('DROP DATABASE ' + database); await server.destroy(); }
}
main().catch(e => { console.error(e instanceof assert.AssertionError ? e.message : (e.code || e.constructor.name)); console.error(e.stack?.split('\n').filter(l => l.includes('migration-legacy.cjs')).join('\n')); process.exitCode = 1; });
