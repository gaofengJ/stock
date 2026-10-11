// Manual, owner-scoped notebook maintenance. No content or credentials are logged.
const db = require(process.cwd() + '/dist/migration-data-source').default;
const { NotebookService } = require(process.cwd() + '/dist/modules/review/notebook.service');
const tables = ['t_review_notebook', 't_review_notebook_version', 't_review_publication'];
(async () => {
  await db.initialize();
  try {
    if (process.env.OPERATION === 'inspect-review-records') {
      const report = {};
      for (const table of tables) report[table] = await db.query(`SELECT user_id owner,COUNT(*) count FROM ${table} GROUP BY user_id`);
      console.log(JSON.stringify(report));
      return;
    }
    if (process.env.OPERATION !== 'clear-review-records' || !/^[1-9]\d*$/.test(process.env.REVIEW_OWNER_ID || '')) throw new Error('Explicit owner ID required');
    const owner = Number(process.env.REVIEW_OWNER_ID);
    const [admin] = await db.query("SELECT u.id FROM t_user u JOIN t_user_role ur ON ur.user_id=u.id JOIN t_role r ON r.id=ur.role_id WHERE u.id=? AND r.code='admin' AND u.is_active=1", [owner]);
    if (!admin) throw new Error('Owner must be an active administrator');
    const removed = await new NotebookService(db).clear(owner);
    const remaining = {};
    for (const table of tables) [remaining[table]] = await db.query(`SELECT COUNT(*) count FROM ${table} WHERE user_id=?`, [owner]);
    console.log(JSON.stringify({ owner, removed, remaining }));
  } finally { await db.destroy(); }
})().catch((e) => { console.error(e.code || e.message); process.exitCode = 1; });
