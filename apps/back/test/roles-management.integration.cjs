const assert = require('node:assert/strict');

module.exports = async function verifyRolesManagement({ db, inject, admin, user }) {
  let id;
  const originalRoles = user.user.roles.map(r => r.id);
  const get = async () => {
    const response = await inject('GET', '/admin/roles', undefined, admin);
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data;
  };
  const patch = (revision, values = {}) => inject('PATCH', `/admin/roles/${id}`, { code: 'roles_fixture', name: '角色测试', description: '测试说明', permissions: ['strategy:read'], ...values, revision }, admin);
  try {
    const roles = await get();
    const ordinary = roles.find(r => r.code === 'user');
    const administrator = roles.find(r => r.code === 'admin');
    const member = ordinary.users.find(u => u.id === user.user.id);
    assert.equal(member.nickname, 'Alice');
    assert.equal(member.active, true);
    assert.equal(new Set(ordinary.users.map(u => u.id)).size, ordinary.users.length);
    roles.forEach(r => assert.match(r.revision, /^[a-f0-9]{64}$/));
    assert.deepEqual((await get()).map(r => r.revision), roles.map(r => r.revision), 'Revision is stable for unchanged data');
    assert.equal((await inject('GET', '/admin/roles', undefined, user)).statusCode, 403);
    assert.equal((await inject('PATCH', `/admin/roles/${administrator.id}`, { code: 'admin', name: '改名', permissions: [], revision: administrator.revision }, admin)).statusCode, 403);
    assert.equal((await inject('DELETE', `/admin/roles/${ordinary.id}`, undefined, admin)).statusCode, 403);
    const created = await inject('POST', '/admin/roles', { code: 'roles_fixture', name: '角色测试', description: '测试说明', permissions: ['strategy:read'] }, admin);
    assert.equal(created.statusCode, 201, created.body);
    id = created.json().data.id;
    const first = (await get()).find(r => r.id === id);
    assert.equal((await patch(undefined)).statusCode, 400, 'Missing revisions cannot silently overwrite data');
    assert.equal((await patch('invalid')).statusCode, 400);
    assert.equal((await patch(first.revision, { name: '第一次更新', permissions: ['review:read'] })).statusCode, 200);
    const updated = (await get()).find(r => r.id === id);
    assert.notEqual(updated.revision, first.revision);
    const conflict = await patch(first.revision, { name: '旧窗口覆盖' });
    assert.equal(conflict.statusCode, 409);
    assert.match(conflict.json().message, /角色已变更/);
    assert.equal((await get()).find(r => r.id === id).name, '第一次更新');
    const concurrent = await Promise.all([
      patch(updated.revision, { name: '并发甲', permissions: ['strategy:read'] }),
      patch(updated.revision, { name: '并发乙', permissions: ['review:read'] }),
    ]);
    assert.deepEqual(concurrent.map(r => r.statusCode).sort(), [200, 409], 'Exactly one concurrent editor can commit the same revision');
    const beforeMembers = (await get()).find(r => r.id === id);
    assert.equal((await inject('PATCH', `/admin/users/${user.user.id}`, { roleIds: [...originalRoles, id] }, admin)).statusCode, 200);
    assert.equal((await patch(beforeMembers.revision)).statusCode, 409, 'Impact confirmation must be refreshed after membership changes');
    const assigned = (await get()).find(r => r.id === id);
    assert.equal(assigned.users.length, 1);
    assert.equal((await inject('DELETE', `/admin/roles/${id}`, undefined, admin)).statusCode, 409);
    assert.equal((await patch(assigned.revision, { permissions: [] })).statusCode, 200);
    const account = (await inject('GET', '/auth/me', undefined, user)).json().data;
    assert.ok(account.permissions.includes('strategy:read'), 'Removing one role permission preserves access granted by another role');
    const persisted = await db.query('SELECT role_name FROM t_role WHERE id=?', [id]);
    assert.equal(persisted[0].role_name, '角色测试');
    console.info('PASS: role metadata, stable revisions, required version validation, stale/concurrent edit rejection, member impact changes, immutable built-ins, attached-role deletion and multi-role union.');
  } finally {
    if (id) {
      assert.equal((await inject('PATCH', `/admin/users/${user.user.id}`, { roleIds: originalRoles }, admin)).statusCode, 200);
      assert.equal((await inject('DELETE', `/admin/roles/${id}`, undefined, admin)).statusCode, 200);
    }
  }
};
