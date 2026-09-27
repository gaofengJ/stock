/* Two-year, resumable production -> test merge. Run with the refresh account. */
const { createHash } = require('crypto');
const KEYS = {
  t_source_daily: ['ts_code', 'trade_date'],
  t_source_limit: ['ts_code', 'trade_date', 'limit'],
  t_processed_senti: ['trade_date'],
  t_source_index_daily: ['trade_date', 'ts_code'],
  t_processed_market_daily: ['trade_date', 'scope'],
  t_source_bse_mapping: ['old_code'],
  t_sync_run: ['task', 'trade_date'],
};
const RAW = ['t_source_daily', 't_source_limit', 't_processed_senti'];
const REFERENCE = [
  't_source_trade_cal',
  't_source_stock',
  't_source_active_funds',
];
const q = (name) => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('非法数据库标识符');
  return '`' + name + '`';
};
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validate(settings) {
  if (
    settings.target !== 'stock_test' ||
    !settings.source ||
    settings.source === settings.target
  )
    throw new Error('只允许写入 stock_test，源库必须不同');
  q(settings.source);
  if (settings.years !== 2) throw new Error('历史同步窗口必须为两个自然年');
}
function startDate(end) {
  const year = Number(end.slice(0, 4)) - 2;
  // Clamp February 29 instead of rolling into March.
  return `${year}${end.slice(4)}`.replace(
    /02-29$/,
    year % 4 ? '02-28' : '02-29',
  );
}

async function refreshHistory(settings, previous = {}, force = false) {
  validate(settings);
  const db = await require('mysql2/promise').createConnection({
    host: settings.host,
    port: settings.port || 3306,
    user: settings.user,
    password: settings.password,
    database: settings.target,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 10000,
  });
  const query = (sql, values = []) =>
    db.query({ sql, timeout: 60000 }, values).then(([rows]) => rows);
  const src = (table) => q(settings.source) + '.' + q(table);
  const dst = (table) => q(settings.target) + '.' + q(table);
  const locks = [];
  let transaction = false;
  try {
    // Both applications use these same locks. Keep a batch <= 3 dates and release
    // both locks before the next batch, so today's collection takes priority.
    for (const database of [settings.source, settings.target].sort()) {
      const name =
        'stock-sync:' +
        createHash('sha256').update(database).digest('hex').slice(0, 40);
      const [lock] = await query('SELECT GET_LOCK(?,0) acquired', [name]);
      if (Number(lock.acquired) !== 1) return { status: 'busy' };
      locks.push(name);
    }
    const tables = await query(
      'SELECT TABLE_SCHEMA db,TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA IN (?,?)',
      [settings.source, settings.target],
    );
    const has = (database, table) =>
      tables.some((r) => r.db === database && r.name === table);
    const shared = (table) =>
      has(settings.source, table) && has(settings.target, table);
    const market = [
      't_source_index_daily',
      't_processed_market_daily',
      't_source_bse_mapping',
    ].every(shared);
    const dated = [
      ...RAW,
      ...(market ? ['t_source_index_daily', 't_processed_market_daily'] : []),
    ];
    const all = [
      ...REFERENCE,
      ...dated,
      't_sync_run',
      ...(market ? ['t_source_bse_mapping'] : []),
    ];
    const columns = {};
    for (const table of all) {
      if (!shared(table)) throw new Error('缺少数据表：' + table);
      const a = await query('SHOW COLUMNS FROM ' + src(table));
      const b = await query('SHOW COLUMNS FROM ' + dst(table));
      if (a.map((r) => r.Field).join() !== b.map((r) => r.Field).join())
        throw new Error('两库表结构不同：' + table);
      columns[table] = a.map((r) => r.Field).filter((name) => name !== 'id');
      if (!KEYS[table]) continue;
      for (const schema of [settings.source, settings.target]) {
        const indexes = await query(
          'SHOW INDEX FROM ' + q(schema) + '.' + q(table),
        );
        const groups = {};
        for (const index of indexes.filter((i) => Number(i.Non_unique) === 0))
          (groups[index.Key_name] ||= [])[Number(index.Seq_in_index) - 1] =
            index.Column_name;
        if (
          !Object.values(groups).some(
            (key) => [...key].sort().join() === [...KEYS[table]].sort().join(),
          )
        )
          throw new Error(
            '缺少业务唯一键，拒绝可能重复的同步：' + schema + '.' + table,
          );
      }
    }
    const [last] = await query(
      'SELECT MAX(trade_date) date FROM ' + src('t_source_daily'),
    );
    if (!last.date) throw new Error('生产日线为空');
    const start = startDate(last.date);
    const days = await query(
      'SELECT cal_date date,pre_trade_date previous FROM ' +
        src('t_source_trade_cal') +
        ' WHERE is_open=1 AND cal_date BETWEEN ? AND ? ORDER BY cal_date',
      [start, last.date],
    );
    if (!days.length) throw new Error('交易日历为空');
    const dates = [...new Set([days[0].previous, ...days.map((d) => d.date)])];
    const excluded = new Set();
    for (const schema of [settings.source, settings.target]) {
      if (has(schema, 't_sync_day_policy')) {
        const rows = await query(
          'SELECT trade_date FROM ' + q(schema) + '.t_sync_day_policy',
        );
        for (const row of rows) excluded.add(row.trade_date);
      }
    }
    const versions = Object.fromEntries(dates.map((date) => [date, {}]));
    for (const table of dated) {
      const rows = await query(
        'SELECT trade_date date,COUNT(*) n,MAX(id) id,MAX(updated_at) updated FROM ' +
          src(table) +
          ' WHERE trade_date BETWEEN ? AND ? GROUP BY trade_date',
        [dates[0], last.date],
      );
      for (const row of rows)
        if (versions[row.date]) versions[row.date][table] = row;
    }
    const stages = await query(
      'SELECT task,trade_date,status,updated_at,daily_count,limit_count FROM ' +
        src('t_sync_run') +
        " WHERE task IN ('daily','market','market-index') AND trade_date BETWEEN ? AND ?",
      [dates[0], last.date],
    );
    for (const stage of stages)
      if (versions[stage.trade_date])
        versions[stage.trade_date][stage.task] = stage;
    const identity = hash([
      settings.host,
      settings.port || 3306,
      settings.source,
      settings.target,
      2,
    ]);
    const copied = previous.identity === identity ? { ...previous.copied } : {};
    const copiedRaw =
      previous.identity === identity ? { ...previous.copiedRaw } : {};
    const signatures = Object.fromEntries(
      dates.map((date) => [date, hash(versions[date])]),
    );
    const blocked = {};
    for (const date of dates) {
      const v = versions[date];
      if (excluded.has(date)) blocked[date] = '主动删除保护';
      else if (!v.t_source_daily?.n) blocked[date] = '生产日线缺失';
      else if (v.daily && v.daily.status !== 'success')
        blocked[date] = '生产日线阶段尚未成功';
      else if (!v.t_source_limit?.n && v.daily?.status !== 'success')
        blocked[date] = '空事件日缺少成功记录';
      else if (
        v.daily &&
        (Number(v.daily.daily_count) !== Number(v.t_source_daily.n) ||
          Number(v.daily.limit_count) !== Number(v.t_source_limit?.n || 0))
      )
        blocked[date] = '生产阶段记录与行数不一致';
    }
    const pending = dates.filter(
      (d) => !blocked[d] && (force || copied[d] !== signatures[d]),
    );
    // Newest first; then fill oldest gaps. State is updated only after COMMIT.
    const selected = [
      ...(pending.includes(last.date) ? [last.date] : []),
      ...pending.filter((d) => d !== last.date),
    ].slice(0, 3);
    const merge = async (table, where = '', params = []) => {
      const names = columns[table].map(q).join(',');
      await query(
        'INSERT INTO ' +
          dst(table) +
          ' (' +
          names +
          ') SELECT ' +
          names +
          ' FROM ' +
          src(table) +
          where +
          ' ORDER BY id ON DUPLICATE KEY UPDATE ' +
          columns[table]
            .filter((c) => !KEYS[table]?.includes(c))
            .map((c) => `${q(c)}=VALUES(${q(c)})`)
            .join(','),
        params,
      );
    };
    const refVersion = [];
    for (const table of REFERENCE)
      refVersion.push(
        (
          await query(
            'SELECT COUNT(*) n,MAX(id) id,MAX(updated_at) updated FROM ' +
              src(table),
          )
        )[0],
      );
    const references = hash(refVersion);
    if (previous.identity !== identity || previous.references !== references) {
      await query('START TRANSACTION');
      transaction = true;
      for (let i = 0; i < REFERENCE.length; i++) {
        const table = REFERENCE[i];
        if (!Number(refVersion[i].n)) {
          if (table !== 't_source_active_funds')
            throw new Error('生产参考数据为空：' + table);
          continue;
        }
        // Reference tables predate business-key indexes. Replace only this small
        // snapshot atomically; never copy production auto-increment IDs.
        await query('DELETE FROM ' + dst(table));
        const names = columns[table].map(q).join(',');
        await query(
          'INSERT INTO ' +
            dst(table) +
            ' (' +
            names +
            ') SELECT ' +
            names +
            ' FROM ' +
            src(table),
        );
      }
      if (market) await merge('t_source_bse_mapping');
      await query('COMMIT');
      transaction = false;
    }
    const processed = [];
    for (const date of selected) {
      const v = versions[date];
      const rawSignature = hash(RAW.map((table) => v[table]));
      const rawChanged = force || copiedRaw[date] !== rawSignature;
      await query('START TRANSACTION');
      transaction = true;
      for (const table of rawChanged ? RAW : []) {
        if (
          table === 't_processed_senti' &&
          excluded.has(days.find((d) => d.date === date)?.previous)
        )
          continue;
        await merge(table, ' WHERE trade_date=?', [date]);
        // Remove obsolete keys only within a verified source day, never history
        // outside the window. This handles corrected event lists including zero.
        const join = KEYS[table]
          .map((c) => `s.${q(c)}=t.${q(c)}`)
          .join(' AND ');
        await query(
          'DELETE t FROM ' +
            dst(table) +
            ' t LEFT JOIN ' +
            src(table) +
            ' s ON ' +
            join +
            ' WHERE t.trade_date=? AND s.id IS NULL',
          [date],
        );
        const [count] = await query(
          'SELECT COUNT(*) n FROM ' + dst(table) + ' WHERE trade_date=?',
          [date],
        );
        if (Number(count.n) !== Number(v[table]?.n || 0))
          throw new Error('同步行数校验失败：' + table + '/' + date);
      }
      const next = days.find((d) => d.previous === date)?.date;
      const affected = [date, ...(next ? [next] : [])];
      if (rawChanged && has(settings.target, 't_processed_market_daily')) {
        await query(
          'DELETE FROM ' +
            dst('t_processed_market_daily') +
            ' WHERE trade_date IN (?)',
          [affected],
        );
        await query(
          'UPDATE ' +
            dst('t_sync_run') +
            " SET status='pending',error='生产原始数据已更新，等待重新汇总',updated_at=UTC_TIMESTAMP(6) WHERE task='market' AND trade_date IN (?)",
          [affected],
        );
      }
      await merge(
        't_sync_run',
        " WHERE trade_date=? AND task='daily' AND status='success'",
        [date],
      );
      if (!v.daily)
        await query(
          'DELETE FROM ' +
            dst('t_sync_run') +
            " WHERE task='daily' AND trade_date=?",
          [date],
        );
      if (
        market &&
        Number(v.t_source_index_daily?.n) === 8 &&
        v['market-index']?.status === 'success'
      ) {
        await merge('t_source_index_daily', ' WHERE trade_date=?', [date]);
        await merge(
          't_sync_run',
          " WHERE trade_date=? AND task='market-index' AND status='success'",
          [date],
        );
        if (
          Number(v.t_processed_market_daily?.n) === 6 &&
          v.market?.status === 'success' &&
          !excluded.has(days.find((d) => d.date === date)?.previous)
        ) {
          await merge('t_processed_market_daily', ' WHERE trade_date=?', [
            date,
          ]);
          await merge(
            't_sync_run',
            " WHERE trade_date=? AND task='market' AND status='success'",
            [date],
          );
        }
      }
      await query('COMMIT');
      transaction = false;
      copied[date] = signatures[date];
      copiedRaw[date] = rawSignature;
      processed.push(date);
      // A corrected predecessor invalidates the next summary; revisit that date
      // even if its own raw rows were unchanged.
      if (rawChanged && next && !selected.includes(next)) delete copied[next];
    }
    const remaining = dates.filter(
      (d) => !blocked[d] && copied[d] !== signatures[d],
    ).length;
    return {
      status: processed.length ? 'copied' : 'unchanged',
      identity,
      references,
      copied,
      copiedRaw,
      processed,
      remaining,
      blocked,
      window: {
        start,
        end: last.date,
        tradingDays: days.length,
        predecessor: dates[0],
      },
    };
  } finally {
    if (transaction) await query('ROLLBACK').catch(() => {});
    for (const name of locks.reverse())
      await query('SELECT RELEASE_LOCK(?)', [name]).catch(() => {});
    await db.end();
  }
}
module.exports = { refreshHistory, validate, startDate, KEYS };
