/* Read-only service benchmark; no application bootstrap, schedules or source fetches. */
const path = require('node:path');
process.chdir(path.join(__dirname, '..'));
require('dotenv').config({ path: process.env.APP_ENV_FILE || '.env.server-test' });
require('ts-node').register({ files: true });
require('tsconfig-paths/register');
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { StrategyReadService } = require('../src/modules/strategy/strategy-read.service');
const { StrategyService } = require('../src/modules/strategy/strategy.service');
const { StrategyCacheService } = require('../src/modules/strategy/strategy-cache.service');
const { SectorService } = require('../src/modules/analysis/market/sector.service');
const { DailyService } = require('../src/modules/source/daily/daily.service');
const { DailyEntity } = require('../src/modules/source/daily/daily.entity');
const { TradeCalService } = require('../src/modules/source/trade-cal/trade-cal.service');
const { TradeCalEntity } = require('../src/modules/source/trade-cal/trade-cal.entity');
const { StockIdentityService } = require('../src/modules/source/stock/stock-identity.service');
const { TrendService } = require('../src/modules/strategy/trend.service');
const db = new DataSource({ type: 'mysql', host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, timezone: 'Z', synchronize: false, logging: false, entities: ['src/**/*.entity.ts'], extra: { connectionLimit: 1 } });
async function main() {
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.query('START TRANSACTION READ ONLY');
  // All repositories and raw queries use the same read-only connection.
  db.manager = runner.manager;
  db.query = (sql, args) => runner.query(sql, args);
  let queries = [];
  const query = runner.query.bind(runner);
  runner.query = async (sql, ...args) => {
    const start = performance.now();
    try { return await query(sql, ...args); }
    finally { queries.push({ ms: Math.round(performance.now() - start), sql: sql.replace(/\s+/g, ' ').slice(0, 190) }); }
  };
  const identity = new StockIdentityService(db, null);
  const sectors = new SectorService(db, null, null, null);
  const service = new StrategyService(new TradeCalService(null, runner.manager.getRepository(TradeCalEntity)), new DailyService(null, runner.manager.getRepository(DailyEntity), identity), sectors, new TrendService(db, null, identity, null), new StrategyCacheService(db), new StrategyReadService(db, identity));
  let stages = [];
  for (const [target, name] of [[service, 'candidates'], [sectors, 'decorate'], [sectors, 'candidateContext']]) {
    const original = target[name].bind(target);
    target[name] = async (...args) => { const start = performance.now(); try { return await original(...args); } finally { stages.push({ name, ms: Math.round(performance.now() - start) }); } };
  }
  try {
    const date = process.argv[2] || '2026-09-30';
    const strategyType = process.argv[3] || 'gapThreeUp';
    if (process.argv.includes('--verify')) {
      const days = (await service.tradeCalService.getLastNDays({ date, n: 4 })).map(r => r.calDate);
      const full = await service.dailyService.getDailyDataByDates(days);
      for (const [key, method, count] of [['gapThreeUp','findGapThreeUp',4],['gapTwoUp','findGapTwoUp',3],['gapThreeHighTurnover','findGapThreeHighTurnover',4],['threeDaysHighVol','findThreeDaysHighVol',3],['continuousGap','findContinuousGap',3],['shadowWrap','findShadowWrap',3]]) {
        const expected = await service.dailyService[method](days.slice(0,count), full);
        const actual = await service.list({ date, strategyType:key });
        const codes = rows => rows.map(r => r.tsCode).sort();
        require('node:assert/strict').deepEqual(codes(actual), codes(expected));
        const decorated = await sectors.decorate(expected, date);
        const links = rows => rows.map(r => [r.tsCode, [...r.industries,...r.topics].map(s => [s.code,s.asOf]).sort()]).sort();
        require('node:assert/strict').deepEqual(links(actual),links(decorated));
        console.log(JSON.stringify({ verified: key, count: actual.length, date }));
      }
      return;
    }
    for (const phase of ['cold', 'warm']) {
      queries = []; stages = [];
      const start = performance.now();
      const rows = await service.list({ date, strategyType });
      console.log(JSON.stringify({ phase, date, strategyType, ms: Math.round(performance.now() - start), count: rows.length, codes: rows.map(r => r.tsCode).sort(), queries: queries.length, stages, slowest: queries.sort((a,b) => b.ms-a.ms).slice(0,5) }));
    }
  } finally { await query('ROLLBACK'); await runner.release(); await db.destroy(); }
}
main().catch(async error => { console.error(error.code || error.name, error.message.replace(/(?:password|host|username)=\S+/gi, '[redacted]')); if (db.isInitialized) await db.destroy(); process.exitCode = 1; });


