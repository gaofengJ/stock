const assert = require('node:assert/strict');
const { ReviewNotebook1792195200000 } = require('../dist/migrations/1792195200000-ReviewNotebook');
const { NotebookService } = require('../dist/modules/review/notebook.service');
module.exports = async ({ db, inject, admin, user }) => {
  const q = db.createQueryRunner();
  try { await new ReviewNotebook1792195200000().up(q); await new ReviewNotebook1792195200000().up(q); } finally { await q.release(); }
  const date = '2026-09-28';
  const content = { private: { execution: 'PRIVATE_SENTINEL', normalPlan: 'PRIVATE_PLAN' }, public: { summary: 'Public thesis', sources: 'Public source at close' } };
  const post = (revision, value = content) => inject('POST', '/review/notebook', { date, revision, content: JSON.stringify(value) }, admin);
  assert.equal((await inject('GET', `/review/notebook?date=${date}`)).statusCode, 401);
  assert.equal((await inject('GET', `/review/notebook?date=${date}`, undefined, user)).statusCode, 403);
  assert.equal((await inject('POST', '/review/notebook', { date, revision: 0, content: JSON.stringify(content) }, user)).statusCode, 403);
  assert.equal((await inject('POST', '/review/notebook', { date, revision: 0, content: JSON.stringify(content) }, {cookie:admin.cookie})).statusCode, 403);
  assert.equal((await post(0)).statusCode, 201);
  const conflict = await Promise.all([post(1), post(1)]);
  assert.deepEqual(conflict.map(r => r.statusCode).sort(), [201, 409]);
  assert.equal((await post(2, { ...content, public: { ...content.public, private: 'forbidden' } })).statusCode, 400);
  assert.equal((await inject('GET', '/review/notebook?date=2026-02-30', undefined, admin)).statusCode, 400);
  const r = await inject('GET', `/review/notebook?date=${date}`, undefined, admin);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.json().data.revision, 2);
  assert.equal(r.json().data.versions.length, 2);
  assert.equal((await inject('GET', `/review/notebook?date=${date}&revision=1`, undefined, admin)).json().data.content.private.execution, 'PRIVATE_SENTINEL');
  const service = new NotebookService(db);
  await service.save(user.user.id, { date: '2026-09-27', revision: 0, content: JSON.stringify({ private: { execution: 'OTHER_OWNER' }, public: {} }) });
  assert.equal((await service.read(admin.user.id, '2026-09-27')).revision, 0);
  assert.equal((await service.read(admin.user.id, '2026-09-29')).previous.date, date);
  assert.equal((await service.list(admin.user.id)).some(r => r.date === '2026-09-27'), false);
  for (const url of ['https://xueqiu.com.evil.invalid/a', 'javascript:alert(1)', 'https://xueqiu.com/']) {
    assert.equal((await inject('POST', '/review/notebook/publications', { date, revision: 2, channel: 'xueqiu', url }, admin)).statusCode, 400);
  }
  assert.equal((await inject('POST', '/review/notebook/publications', { date, revision: 2, channel: 'xueqiu', url: 'https://xueqiu.com/123/456' }, admin)).statusCode, 201);
  const publications = (await service.read(admin.user.id, date)).publications;
  assert.equal(publications.length, 1);
  assert.ok(publications[0].body.includes('Public thesis'));
  assert.ok(!publications[0].body.includes('PRIVATE_'));
  const newContent = { ...content, public: { ...content.public, summary: 'Edited thesis' } };
  assert.equal((await post(2, newContent)).statusCode, 201);
  assert.ok((await service.read(admin.user.id, date)).publications[0].body.includes('Public thesis'));
  await db.query('DELETE FROM t_review_publication');
  await db.query('DELETE FROM t_review_notebook_version');
  await db.query('DELETE FROM t_review_notebook');
  console.info('PASS: private notebook ownership, CSRF, versions, concurrent saves and public-only snapshots.');
};
