const assert = require('node:assert/strict');

module.exports = async function verifyLoginActivity({ db, auth, inject, admin, user, loginAdmin }) {
  const ids = [];
  const keyword = 'activity_fixture';
  const day = new Date(Date.now() - 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  const midnight = new Date(`${day}T00:00:00+08:00`).getTime();
  async function insert(time, registered = false) {
    const result = await db.query(
      "INSERT INTO t_auth_audit(actor_id,actor_name,action,target,result,detail,created_at,updated_at) VALUES (?,?,'auth.member-login',?,'success',?,?,?)",
      [user.user.id, keyword, String(user.user.id), JSON.stringify({ registered }), new Date(time), new Date(time)],
    );
    ids.push(result.insertId);
    return result.insertId;
  }
  const get = async (query = '') => {
    const response = await inject('GET', `/admin/login-activity?keyword=${keyword}${query}`, undefined, admin);
    assert.equal(response.statusCode, 200, response.body);
    return response.json().data;
  };
  try {
    await loginAdmin();
    const adminRows = (await inject('GET', '/admin/login-activity?keyword=mufeng', undefined, admin)).json().data;
    assert.ok(adminRows.items.some(item => item.isAdmin && !item.registered && item.unread), 'Real administrator login appears and notifies');
    const adminItem = adminRows.items.find(item => item.isAdmin && !item.registered);
    ids.push(adminItem.id);
    assert.equal((await inject('POST', `/admin/login-activity/${adminItem.id}/read`, undefined, admin)).statusCode, 201);
    assert.ok(!(await inject('GET', '/admin/login-activity?keyword=mufeng&status=unread', undefined, admin)).json().data.items.some(item => item.id === adminItem.id));
    assert.ok((await auth.loginActivity(user.user, { page: 1, pageSize: 20, keyword: 'mufeng' })).items.find(item => item.id === adminItem.id).unread, 'Administrator record read status remains personal');
    for (let i = 0; i < 60; i++) await insert(midnight + 43200000 + i * 1000, i === 0);
    await insert(midnight);
    await insert(midnight + 86400000 - 1);
    await insert(midnight - 1);
    await insert(midnight + 86400000);
    const expired = await insert(Date.now() - 91 * 86400000);
    const first = await get();
    assert.ok(first.items.every(item => item.isAdmin === false), 'Legacy ordinary-user activity defaults to non-administrator');
    assert.equal(first.total, 64, 'Expired entries are excluded before daily cleanup runs');
    assert.equal(first.items.length, 20);
    const pages = [first];
    for (let page = 2; page <= 4; page++) pages.push(await get(`&page=${page}`));
    assert.equal(new Set(pages.flatMap(p => p.items.map(x => x.id))).size, 64, 'All retained entries are reachable beyond the old 50-item cap');
    assert.equal((await get('&page=99')).page, 4, 'Out-of-range pages clamp after data changes');
    assert.equal((await get(`&startDate=${day}&endDate=${day}`)).total, 62, 'Shanghai midnight is inclusive; the next midnight is exclusive');
    assert.equal((await get('&event=register')).total, 1);
    assert.equal((await get('&event=login')).total, 63);
    const nickname = (await db.query('SELECT nickname FROM t_user WHERE id=?', [user.user.id]))[0].nickname;
    const byNickname = (await inject('GET', `/admin/login-activity?keyword=${encodeURIComponent(nickname)}`, undefined, admin)).json().data;
    assert.ok(byNickname.items.some(item => ids.includes(item.id)), 'Search matches nicknames too');
    assert.equal((await inject('GET', '/admin/login-activity?keyword=%25', undefined, admin)).json().data.total, 0, 'Search treats wildcard characters literally');
    for (const query of ['page=0', 'pageSize=101', 'startDate=2026-02-30', 'status=invalid', 'startDate=2026-10-06&endDate=2026-10-01']) {
      assert.equal((await inject('GET', `/admin/login-activity?${query}`, undefined, admin)).statusCode, 400, query);
    }
    const single = first.items[0].id;
    assert.equal((await inject('POST', `/admin/login-activity/${single}/read`, undefined, user)).statusCode, 403);
    assert.equal((await inject('POST', `/admin/login-activity/${expired}/read`, undefined, admin)).statusCode, 404);
    assert.equal((await inject('POST', '/admin/login-activity/-1/read', undefined, admin)).statusCode, 400);
    for (let i = 0; i < 2; i++) assert.equal((await inject('POST', `/admin/login-activity/${single}/read`, undefined, admin)).statusCode, 201);
    assert.equal((await get('&status=unread')).total, 63, 'Single marking does not consume earlier unread entries');
    assert.equal((await get('&status=read')).total, 1);
    const personal = await auth.loginActivity(user.user, { page: 1, pageSize: 100, keyword });
    assert.equal(personal.items.filter(x => x.unread).length, 64, 'Read state belongs to one administrator');
    const snapshot = await get('&event=register');
    const newcomer = await insert(Date.now());
    assert.equal((await inject('POST', '/admin/login-activity/read', { throughId: snapshot.latestId }, admin)).statusCode, 201);
    const after = await get('&status=unread');
    assert.equal(after.total, 1, 'Mark all includes other pages and filters but excludes new arrivals');
    assert.equal(after.items[0].id, newcomer);
    assert.equal((await get('&status=read')).total, 64);
    await db.query('DELETE FROM t_auth_audit WHERE id=?', [single]);
    assert.equal(Number((await db.query('SELECT COUNT(*) n FROM t_auth_activity_item_read WHERE audit_id=?', [single]))[0].n), 0, 'Retention cleanup removes individual markers');
    console.info('PASS: login activity pagination, filters, Beijing date boundaries, per-user single read, snapshot bulk read, retention and validation.');
  } finally {
    if (ids.length) await db.query('DELETE FROM t_auth_audit WHERE id IN (?)', [ids]);
  }
};
