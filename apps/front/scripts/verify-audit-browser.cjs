/* CI only: static local export, synthetic accounts, every API mocked, no external traffic. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.FRONT_TEST_URL || 'http://127.0.0.1:8087';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local fixture server required');
const output = process.env.TEST_ARTIFACT_DIR || '/tmp/stock-audit-browser';
fs.mkdirSync(output, { recursive: true });
const date = '2026-10-22';
const status = { revision: 'fixture', latestDate: date, expectedDate: date, dates: [date], stages: [], backfill: null };
const user = { id: 91, username: 'fixture', nickname: '测试账户', roles: [], mustChangePassword: false, permissions: ['analysis:overview'], catalog: [{ code: 'analysis:overview', route: '/analysis/overview', name: '概览', group: '分析' }] };
const stats = { amount: 100000, up: 3000, down: 2000, flat: 100, total: 5100, upRatio: 58.82, distribution: [], limitUp: 30, limitDown: 5, broken: 8, maxHeight: 4, counts: [], upgrades: [] };
(async () => {
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  context.setDefaultNavigationTimeout(20000);
  context.setDefaultTimeout(20000);
  let signedIn = false;
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const api = url.pathname;
    let data = {};
    if (api === '/api/auth/access') {
      if (!signedIn && url.searchParams.get('startTrial') === '1') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: -101, message: '请先登录', data: null }) });
      data = { user: signedIn ? user : null, trial: null };
    }
    if (api === '/api/auth/csrf') data = { csrfToken: 'fixture' };
    if (api === '/api/auth/login') { signedIn = true; data = { csrfToken: 'rotated-fixture' }; }
    if (api === '/api/feedback/unread') data = { unread: false };
    if (api === '/api/basic/trade-cal/list') data = [{ calDate: date, isOpen: 1 }];
    if (api === '/api/analysis/market/status') data = status;
    if (api === '/api/analysis/market/breadth') data = { date, series: [], snapshot: null, stage: { status: 'pending' } };
    if (api === '/api/analysis/market/extremes') data = { date, scope: 'all', period: Number(url.searchParams.get('period')), series: [], snapshot: null, items: [], ready: false };
    if (api === '/api/analysis/market/overview') data = { status, date, snapshot: stats, series: [{ date, data: stats }], markets: [], indexes: Array.from({ length: 8 }, (_, i) => ({ code: `00000${i}.SH`, name: `测试指数${i}`, series: [{ date, open: 10, close: 11, high: 12, low: 9, vol: 100, amount: 1000, preClose: 10, pctChg: 10 }] })) };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data }) });
  });
  page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/analysis/overview/?date=${date}`);
  await page.getByLabel('用户名', { exact: true }).fill('fixture');
  await page.getByLabel('密码', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await page.waitForURL(url => url.pathname === '/analysis/overview/' && url.searchParams.get('date') === date);
  await page.getByRole('button', { name: '查看测试指数0走势' }).waitFor();
  assert(await page.locator('canvas').count() < 8, 'offscreen charts should not initialize on the first screen');
  assert(await page.getByText('图表将在滚动到此处时加载').count() > 0);
  const metrics = await page.locator('.market-metrics').first().locator('.ant-col').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { top: r.top, width: r.width }; }));
  assert.equal(metrics[0].top, metrics[1].top, 'mobile summary should use two columns');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'mobile-overview.png') });
  await page.getByRole('button', { name: '查看测试指数0走势' }).click();
  await page.locator('canvas').first().waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  await page.goto(`${base}/analysis/overview/?date=${date}&reviewCapture=1`);
  await page.locator('main[data-capture-revision="fixture"]').waitFor();
  assert.equal(await page.locator('.ant-layout-header').count(), 0, 'capture presentation omits navigation');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS login destination, mobile layout, deferred charts, selected chart and capture presentation');
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(output, 'audit-failure.png') }).catch(() => {});
      console.error(await page.locator('body').innerText().catch(() => 'No page'));
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
