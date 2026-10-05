const assert = require('node:assert/strict');

module.exports = async function verifyFeedback({ inject, user, admin, db }) {
  const unread = async (client) => {
    const response = await inject('GET', '/feedback/unread', undefined, client);
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data.unread;
  };
  const read = (client, id, throughReplyId) => inject('POST', `/feedback/${id}/read`, { throughReplyId }, client);
  assert.equal((await inject('GET', '/feedback/unread')).statusCode, 401);
  assert.equal(await unread(user), false);
  assert.equal(await unread(admin), false);
  assert.equal((await inject('GET', '/feedback')).statusCode, 401);
  const guest = await inject('GET', '/auth/access?startTrial=1');
  const guestCookie = [].concat(guest.headers['set-cookie'] || []).map(v => v.split(';')[0]).join('; ');
  assert.equal((await inject('GET', '/feedback', undefined, { cookie: guestCookie })).statusCode, 401);
  assert.equal((await inject('POST', '/feedback', { content: 'secret' }, { cookie: user.cookie })).statusCode, 403);
  for (const content of ['', '   ', 42, 'x'.repeat(2001)]) {
    assert.equal((await inject('POST', '/feedback', { content }, user)).statusCode, 400);
  }
  assert.equal((await inject('POST', '/feedback', { content: 'secret', userId: admin.user.id }, user)).statusCode, 400);
  assert.equal((await inject('GET', '/feedback?page=0', undefined, user)).statusCode, 400);
  const create = await inject('POST', '/feedback', { content: '  功能建议 🔒  ' }, user);
  assert.equal(create.statusCode, 201, create.body);
  const id = create.json().data.id;
  const adminCreate = await inject('POST', '/feedback', { content: '管理员自己的私密反馈' }, admin);
  assert.equal(adminCreate.statusCode, 201, adminCreate.body);
  const hiddenId = adminCreate.json().data.id;
  const own = (await inject('GET', '/feedback', undefined, user)).json().data;
  assert.equal(own.total, 1);
  assert.deepEqual(own.items.map(v => v.id), [id]);
  assert.equal(own.items[0].content, '功能建议 🔒');
  assert.equal(own.items[0].unread, false, 'Own feedback does not notify its author');
  assert.equal(await unread(user), false);
  assert.equal(await unread(admin), true, 'New feedback notifies administrators');
  assert.equal((await inject('GET', '/feedback', undefined, admin)).json().data.items.find(item => item.id === id).unread, true);
  assert.equal((await read(user, hiddenId, 0)).statusCode, 404, 'Cannot mark another user feedback as read');
  assert.equal((await read({cookie: admin.cookie}, id, 0)).statusCode, 403, 'Read receipts require CSRF');
  assert.equal((await read(admin, id, -1)).statusCode, 400);
  assert.equal((await read(admin, id, 2147483647)).statusCode, 404, 'Cannot suppress future replies with an invented cursor');
  assert.equal((await read(admin, id, 0)).statusCode, 201);
  assert.equal(await unread(admin), false);
  assert.ok(Math.abs(Date.now() - Date.parse(own.items[0].createdAt)) < 10000, 'Creation time uses UTC regardless of database timezone');
  assert.equal((await inject('GET', '/feedback', undefined, admin)).json().data.total, 2);
  assert.equal((await inject('GET', `/feedback/${hiddenId}`, undefined, user)).statusCode, 404);
  assert.equal((await inject('POST', `/feedback/${hiddenId}/replies`, { content: '越权回复' }, user)).statusCode, 404);
  assert.equal((await inject('POST', `/feedback/${id}/replies`, { content: '已收到，我们会评估。' }, admin)).statusCode, 201);
  assert.equal(await unread(admin), false, 'Own replies do not notify the administrator');
  assert.equal(await unread(user), true, 'Administrator reply notifies the owner');
  const firstDetail = (await inject('GET', `/feedback/${id}`, undefined, user)).json().data;
  assert.equal(await unread(user), true, 'GET/prefetch does not clear unread state');
  assert.equal((await read(user, id, 0)).statusCode, 201);
  assert.equal(await unread(user), true, 'A reply arriving after a displayed snapshot remains unread');
  assert.equal((await read(user, id, firstDetail.throughReplyId)).statusCode, 201);
  assert.equal(await unread(user), false);
  assert.equal((await read(user, id, 0)).statusCode, 201);
  assert.equal(await unread(user), false, 'Older tabs cannot move the read cursor backwards');
  assert.equal((await inject('POST', `/feedback/${id}/replies`, { content: '谢谢，补充说明。' }, user)).statusCode, 201);
  assert.equal(await unread(user), false);
  assert.equal(await unread(admin), true, 'Owner reply notifies the administrator again');
  assert.equal((await inject('POST', `/feedback/${id}/replies`, { content: '伪造管理员', isAdmin: true }, user)).statusCode, 400);
  const detail = (await inject('GET', `/feedback/${id}`, undefined, user)).json().data;
  assert.equal(detail.replies.length, 2);
  assert.equal(Number(detail.replies[0].isAdmin), 1);
  assert.equal(Number(detail.replies[1].isAdmin), 0);
  assert.equal(detail.replies[1].content, '谢谢，补充说明。');
  assert.equal((await read(admin, id, firstDetail.throughReplyId)).statusCode, 201);
  assert.equal(await unread(admin), true, 'Newer replies are preserved when reading an older snapshot');
  assert.equal((await read(admin, id, detail.throughReplyId)).statusCode, 201);
  assert.equal(await unread(admin), false);
  assert.equal((await inject('GET', '/feedback', undefined, admin)).json().data.items.find(item => item.id === id).unread, false);
  // Read receipts are scoped to each viewer, including separate administrators.
  const [adminRoleForRead] = await db.query("SELECT id FROM t_role WHERE code='admin'");
  await db.query('INSERT INTO t_user_role(user_id,role_id) VALUES(?,?)', [user.user.id, adminRoleForRead.id]);
  try {
    assert.equal(await unread(user), true, 'Another administrator still sees the unread admin-created feedback');
    assert.equal((await read(user, hiddenId, 0)).statusCode, 201);
    assert.equal(await unread(user), false);
  } finally {
    await db.query('DELETE FROM t_user_role WHERE user_id=? AND role_id=?', [user.user.id, adminRoleForRead.id]);
  }
  assert.ok(Math.abs(Date.now() - Date.parse(detail.replies[1].createdAt)) < 10000, 'Reply time uses UTC');
  const [role] = await db.query("SELECT id FROM t_role WHERE code='admin'");
  await db.query('DELETE FROM t_user_role WHERE user_id=? AND role_id=?', [admin.user.id, role.id]);
  try {
    assert.equal(await unread(admin), false, 'Unread query respects revoked administrator access');
    assert.equal((await inject('GET', '/feedback', undefined, admin)).json().data.total, 1, 'Former admin only sees own feedback');
    assert.equal((await inject('GET', `/feedback/${id}`, undefined, admin)).statusCode, 404);
    assert.equal((await inject('POST', `/feedback/${id}/replies`, { content: '越权回复' }, admin)).statusCode, 404);
  } finally {
    await db.query('INSERT INTO t_user_role(user_id,role_id) VALUES(?,?)', [admin.user.id, role.id]);
  }
  console.info('Feedback privacy, replies, unread notifications, read snapshots, role revocation and validation verified.');
};
