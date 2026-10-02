/* Reconstruct aggregate breadth from unadjusted five-minute bars. Never persist bars. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const TIMES = [];
for (const [start, end] of [[575, 690], [785, 900]]) {
  for (let minute = start; minute <= end; minute += 5)
    TIMES.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
}
const cents = (value) => Math.round(Number(value) * 100);
const inScope = (code) => /^(60\d{4}\.SH|68\d{4}\.SH|00\d{4}\.SZ|30\d{4}\.SZ|\d{6}\.BJ)$/.test(code);

function parseBars(text) {
  const match = text.match(/=\(([\s\S]*)\);?\s*$/);
  if (!match) throw new Error('Invalid Sina response');
  const bars = JSON.parse(match[1]);
  if (!Array.isArray(bars) || !bars.length || bars.length > 2000) throw new Error('Missing Sina bars');
  let previous = '';
  for (const bar of bars) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/.test(bar.day) || bar.day <= previous || !Number.isFinite(Number(bar.close)) || Number(bar.close) <= 0)
      throw new Error('Invalid or unordered Sina bar');
    previous = bar.day;
  }
  return bars;
}

function parseEastmoneyBars(text) {
  const data = JSON.parse(text).data;
  if (!Array.isArray(data?.klines)) throw new Error('Missing Eastmoney bars');
  const bars = data.klines.map((line) => {
    const [day, open, close, high, low, volume, amount] = line.split(',');
    return { day: `${day}:00`, open, close, high, low, volume: String(Number(volume) * 100), amount };
  });
  return parseBars(`=(${JSON.stringify(bars)});`);
}

function contributions(bars, daily) {
  const byDate = new Map();
  for (const bar of bars) {
    const date = bar.day.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(bar);
  }
  const results = [];
  for (const row of daily) {
    const values = byDate.get(row.date);
    if (!values || values.some((bar) => !TIMES.includes(bar.day.slice(11, 16))))
      throw new Error(`Invalid five-minute coverage ${row.date}`);
    // Sina omits zero-trade bars. Carry prices only when ALL daily volume is accounted for.
    const completeVolume = values.reduce((sum, bar) => sum + Number(bar.volume), 0) === Math.round(Number(row.vol) * 100);
    if (values.length !== TIMES.length && !completeVolume)
      throw new Error(`Unverified missing five-minute bar ${row.date}`);
    if (cents(values.at(-1).close) !== cents(row.close)) throw new Error(`Daily close mismatch ${row.date}`);
    if (!(Number(row.pre_close) > 0)) throw new Error(`Invalid reference price ${row.date}`);
    const byTime = new Map(values.map((bar) => [bar.day.slice(11, 16), bar]));
    let price = cents(row.pre_close);
    results.push({ date: row.date, changes: TIMES.map((time) => {
      const bar = byTime.get(time);
      if (bar) price = cents(bar.close);
      return Math.sign(price - cents(row.pre_close));
    }) });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
  const envFile = option('--env', '');
  const env = envFile ? dotenv.parse(fs.readFileSync(envFile)) : process.env;
  const statePath = path.resolve(option('--state', '.temp/intraday-backfill-state.json'));
  const end = option('--end', new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
  const max = Number(option('--max', 'Infinity'));
  const interval = Math.max(1000, Number(option('--interval', '1000')));
  const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE, dateStrings: true, timezone: 'Z', connectTimeout: 10000 });
  try {
    const [calendar] = await db.query({ sql: 'SELECT cal_date date FROM t_source_trade_cal WHERE cal_date<=? AND is_open=1 ORDER BY cal_date DESC LIMIT 30', timeout: 30000 }, [end]);
    if (calendar.length !== 30) throw new Error('Need thirty known trading days');
    const dates = calendar.map((row) => row.date).reverse();
    const [mapping] = await db.query('SELECT old_code,new_code FROM t_source_bse_mapping');
    const aliases = new Map(mapping.map((row) => [row.old_code, row.new_code]));
    const stocks = new Map();
    const expected = {};
    for (const date of dates) {
      const [rows] = await db.query({ sql: 'SELECT ts_code,close,pre_close,amount,vol FROM t_source_daily FORCE INDEX(index_trade_date) WHERE trade_date=? AND amount>0', timeout: 30000 }, [date]);
      const unique = new Map();
      for (const row of rows) {
        if (!inScope(row.ts_code)) continue;
        const code = aliases.get(row.ts_code) || row.ts_code;
        const old = unique.get(code);
        if (old && (cents(old.close) !== cents(row.close) || cents(old.pre_close) !== cents(row.pre_close) || Number(old.vol) !== Number(row.vol))) throw new Error(`Conflicting daily aliases ${code} ${date}`);
        unique.set(code, row);
      }
      if (unique.size < 4000) throw new Error(`Incomplete daily universe ${date}`);
      expected[date] = { total: unique.size, up: 0, down: 0 };
      for (const [code, row] of unique) {
        if (!stocks.has(code)) stocks.set(code, []);
        stocks.get(code).push({ date, close: row.close, pre_close: row.pre_close, vol: row.vol });
        const direction = Math.sign(cents(row.close) - cents(row.pre_close));
        if (direction > 0) expected[date].up += 1;
        if (direction < 0) expected[date].down += 1;
      }
    }
    const entries = [...stocks].sort(([a], [b]) => a.localeCompare(b));
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { version: 1, fingerprint, dates, expected, totalStocks: entries.length, done: [], failed: {}, counts: Object.fromEntries(dates.map((date) => [date, TIMES.map((time) => ({ time, up: 0, down: 0, samples: 0 }))])) };
    if (state.fingerprint !== fingerprint || state.version !== 1) throw new Error('Checkpoint baseline changed; choose a new state path');
    const save = () => { fs.mkdirSync(path.dirname(statePath), { recursive: true }); state.updatedAt = new Date().toISOString(); fs.writeFileSync(`${statePath}.next`, JSON.stringify(state)); fs.renameSync(`${statePath}.next`, statePath); };
    save();
    console.log(JSON.stringify({ phase: 'started', stocks: entries.length, done: state.done.length, dates }));
    const done = new Set(state.done);
    let attempted = 0;
    let failedStreak = 0;
    for (const [code, daily] of entries) {
      if (done.has(code) || attempted >= max) continue;
      attempted += 1;
      const start = Date.now();
      try {
        const [number, exchange] = code.split('.');
        const symbol = `${exchange.toLowerCase()}${number}`;
        let contribution;
        let provider = 'sina';
        try {
          const response = await fetch(`https://quotes.sina.cn/cn/api/jsonp_v2.php/=/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=5&ma=no&datalen=1970`, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn/' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          contribution = contributions(parseBars(await response.text()), daily);
        } catch {
          // Independent historical source fills actual missing bars, never guessed prices.
          await new Promise((resolve) => setTimeout(resolve, interval));
          provider = 'eastmoney';
          const secid = `${exchange === 'SH' ? '1' : '0'}.${number}`;
          const url = new URL('https://push2his.eastmoney.com/api/qt/stock/kline/get');
          url.search = new URLSearchParams({ secid, fields1: 'f1,f2,f3,f4,f5,f6', fields2: 'f51,f52,f53,f54,f55,f56,f57', klt: '5', fqt: '0', beg: dates[0].replaceAll('-', ''), end: dates.at(-1).replaceAll('-', ''), lmt: '1970', ut: '7eea3edcaed734bea9cbfc24409ed9894' }).toString();
          const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error(`Backup HTTP ${response.status}`);
          contribution = contributions(parseEastmoneyBars(await response.text()), daily);
        }
        for (const day of contribution) day.changes.forEach((direction, index) => {
          const point = state.counts[day.date][index];
          point.samples += 1;
          if (direction > 0) point.up += 1;
          if (direction < 0) point.down += 1;
        });
        state.done.push(code); done.add(code); delete state.failed[code];
        state.providers ||= {};
        state.providers[provider] = (state.providers[provider] || 0) + 1;
        failedStreak = 0;
      } catch (error) {
        state.failed[code] = String(error.message).slice(0, 180);
        failedStreak += 1;
      }
      save();
      if (failedStreak >= 20) { console.log('Pausing after twenty consecutive unavailable stocks; checkpoint saved'); break; }
      if (attempted % 50 === 0 || attempted === max) console.log(JSON.stringify({ phase: 'progress', attempted, done: state.done.length, total: entries.length, failed: Object.keys(state.failed).length }));
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, interval - (Date.now() - start))));
    }
    state.complete = state.done.length === entries.length;
    for (const date of dates) {
      const points = state.counts[date];
      if (points.some((point) => point.samples !== expected[date].total) || points.at(-1).up !== expected[date].up || points.at(-1).down !== expected[date].down) state.complete = false;
    }
    save();
    if (args.includes('--write')) {
      if (!state.complete) throw new Error('Incomplete history: refusing to publish partial counts');
      await db.beginTransaction();
      try {
        const [lock] = await db.query("SELECT GET_LOCK('stock_cls_counts_v1',0) acquired");
        if (Number(lock[0].acquired) !== 1) throw new Error('Collector busy');
        for (const date of dates) for (const point of state.counts[date]) await db.query('INSERT IGNORE INTO t_market_intraday_counts(trade_date,sample_time,up_count,down_count,collected_at,source) VALUES(?,?,?,?,UTC_TIMESTAMP(3),?)', [date, `${point.time}:00`, point.up, point.down, 'history_5m']);
        const [kept] = await db.query("SELECT DISTINCT DATE_FORMAT(trade_date,'%Y-%m-%d') date FROM t_market_intraday_counts ORDER BY date DESC LIMIT 30");
        if (kept.length === 30) await db.query('DELETE FROM t_market_intraday_counts WHERE trade_date<?', [kept.at(-1).date]);
        await db.commit();
      } catch (error) { await db.rollback(); throw error; }
      finally { await db.query("SELECT RELEASE_LOCK('stock_cls_counts_v1')"); }
      console.log(JSON.stringify({ phase: 'published', dates: dates.length, points: dates.length * TIMES.length }));
    }
    console.log(JSON.stringify({ phase: 'finished', complete: state.complete, done: state.done.length, failed: Object.keys(state.failed).length }));
  } finally { await db.end(); }
}
module.exports = { TIMES, parseBars, parseEastmoneyBars, contributions };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
