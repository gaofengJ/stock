const assert = require('node:assert/strict');

module.exports = async function verifyUsersManagement({ db, inject, admin, user, login }) {
  const ids = [];
  const [ordinary] = await db.query("SELECT id FROM t_role WHERE code='user'");
  const [administrator] = await db.query("SELECT id FROM t_role WHERE code='admin'");
  const [source] = await db.query('SELECT password FROM t_user WHERE id=?', [user.user.id]);
  const get = async (query = '') => {
    const response = await inject('GET', `/admin/users?${query}`, undefined, admin);
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data;
  };
  try {
    for (let i = 0; i < 24; i++) {
      const result = await db.query(
        'INSERT INTO t_user(username,nickname,password,is_active,must_change_password,last_login) VALUES (?,?,?,?,?,?)',
        [`users_fixture_${i}`, `测试成员${i}`, source.password, i === 0 ? 0 : 1, i === 1 ? 1 : 0, '2026-10-06 05:17:30'],
      );
      ids.push(result.insertId);
      await db.query('INSERT INTO t_user_role(user_id,role_id) VALUES (?,?)', [result.insertId, ordinary.id]);
    }
    const first = await get('keyword=users_fixture');
    assert.equal(first.total, 24);
    assert.equal(first.items.length, 20);
    const second = await get('keyword=users_fixture&page=2');
    assert.equal(second.items.length, 4);
    assert.equal(new Set([...first.items, ...second.items].map(x => x.id)).size, 24);
    assert.equal((await get('keyword=users_fixture&page=99')).page, 2);
    assert.equal((await get('keyword=no_matching_member&page=99')).page, 1);
    assert.equal((await get('keyword=%25')).total, 0, 'Wildcard characters are literal');
    const nickname = await get(`keyword=${encodeURIComponent('测试成员0')}&active=0&roleId=${ordinary.id}`);
    assert.equal(nickname.total, 1, 'Nickname, status and role filters combine');
    assert.equal(nickname.items[0].id, ids[0]);
    assert.equal(new Date(nickname.items[0].lastLogin).toISOString(), '2026-10-06T05:17:30.000Z');
    assert.equal((await get(`keyword=users_fixture&roleId=${administrator.id}`)).total, 0);
    assert.equal((await get('keyword=users_fixture&active=1')).total, 23);
    assert.equal((await get('keyword=users_fixture&active=0')).activeAdminCount, 1, 'Administrator count ignores filters');
    for (const query of ['roleId=0', 'roleId=1.5', 'roleId=abc', 'active=2', 'page=0', 'pageSize=101']) {
      assert.equal((await inject('GET', `/admin/users?${query}`, undefined, admin)).statusCode, 400, query);
    }
    assert.equal((await inject('GET', '/admin/users', undefined, user)).statusCode, 403);
    assert.equal((await inject('PATCH', `/admin/users/${admin.user.id}`, { active: false }, admin)).statusCode, 409);
    assert.equal((await inject('PATCH', `/admin/users/${admin.user.id}`, { roleIds: [] }, admin)).statusCode, 409);
    assert.equal((await inject('GET', '/auth/me', undefined, admin)).statusCode, 200, 'Rejected last-admin changes roll back session deletion');
    await db.query('INSERT INTO t_user_role(user_id,role_id) VALUES (?,?)', [ids[23], administrator.id]);
    assert.equal((await get(`keyword=users_fixture_23&roleId=${administrator.id}`)).activeAdminCount, 2);
    const own = await login('users_fixture_23', 'test-password-123');
    assert.equal((await inject('POST', `/admin/users/${own.user.id}/reset-password`, { password: 'new-temporary-password-123' }, own)).statusCode, 201);
    assert.equal((await inject('GET', '/auth/me', undefined, own)).statusCode, 401, 'Resetting own password revokes the active session');
    const again = await login('users_fixture_23', 'new-temporary-password-123');
    assert.equal(again.user.mustChangePassword, true);
    assert.equal((await inject('GET', '/auth/me', undefined, admin)).statusCode, 200, 'Other administrators retain their sessions');
    console.info('PASS: user filters, literal nickname search, pagination, global administrator count, last-admin rollback, UTC timestamps and own password reset.');
  } finally {
    if (ids.length) {
      await db.query('DELETE FROM t_user_role WHERE user_id IN (?)', [ids]);
      await db.query('DELETE FROM t_user WHERE id IN (?)', [ids]);
    }
  }
};
