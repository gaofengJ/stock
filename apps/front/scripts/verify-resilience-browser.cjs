/* Run against a local dev server. Every API request is mocked; external requests are blocked.
 * PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/path/to/chromium
 * FRONT_TEST_URL=http://127.0.0.1:8087 node scripts/verify-resilience-browser.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.FRONT_TEST_URL || 'http://127.0.0.1:8087';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Only a local test server is permitted');
const output = process.env.TEST_ARTIFACT_DIR || '/tmp/stock-frontend-resilience';
fs.mkdirSync(output, { recursive: true });
const date = '2026-10-12';
const routes = ['/review', '/news', '/analysis/chains', '/analysis/overview', '/strategy', '/basic/stock'];
const account = { id: 91, username: 'fixture', nickname: '测试账户', roles: [{ id: 1, code: 'admin', name: '管理员' }], permissions: routes, catalog: routes.map(route => ({ code: route, route, name: route, group: 'fixture' })), mustChangePassword: false };
const ok = (route, data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data }) });
const wait = async (predicate, label) => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Timed out: ${label}`); };

async function mockContext(browser, handler) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  context.setDefaultNavigationTimeout(20000);
  context.setDefaultTimeout(20000);
  await context.addInitScript(() => {
    const interval = window.setInterval.bind(window);
    window.__minuteCallbacks = [];
    window.setInterval = (fn, ms, ...args) => { if (ms === 60000) window.__minuteCallbacks.push(() => fn(...args)); return interval(fn, ms, ...args); };
  });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (await handler?.(route, url)) return;
    if (url.pathname === '/api/auth/access') return ok(route, { user: account, trial: null });
    if (url.pathname === '/api/auth/csrf') return ok(route, { csrfToken: 'fixture-only' });
    if (url.pathname === '/api/feedback/unread') return ok(route, { unread: false });
    if (url.pathname === '/api/common/all-options') return ok(route, {});
    if (url.pathname === '/api/basic/trade-cal/list') return ok(route, [{ calDate: date, isOpen: 1 }]);
    if (url.pathname === '/api/analysis/market/sector-options') return ok(route, { items: [], asOf: date });
    if (url.pathname === '/api/review/report') return ok(route, null);
    return ok(route, {});
  });
  return context;
}

async function notebookTest(browser) {
  let failure = false; let signedOut = false; let reads = 0; let failures = 0;
  const context = await mockContext(browser, async (route, url) => {
    if (url.pathname === '/api/auth/access') {
      if (signedOut) { await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: -101, data: null }) }); return true; }
      if (failure) { failures++; await route.abort('failed'); return true; }
    }
    if (url.pathname === '/api/review/notebook') {
      reads++;
      assert.equal(url.searchParams.get('publicationBodies'), '0');
      await ok(route, { date, revision: 1, generation: 0, content: null }); return true;
    }
    return false;
  });
  const page = await context.newPage();
  const pageErrors=[];page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${base}/review/?date=${date}`, { waitUntil: 'networkidle' });
  const text = page.locator('#note-marketJudgment');
  await text.fill('未保存的复盘原文应在网络恢复后继续保留');
  const initialReads = reads;
  failure = true;
  await page.clock.install();
  await page.clock.fastForward(2100);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('访问状态暂时无法更新，当前编辑内容已保留').waitFor();
  assert.equal(await text.inputValue(), '未保存的复盘原文应在网络恢复后继续保留');
  assert.equal(reads, initialReads);
  assert(failures > 0);
  await page.screenshot({ path: path.join(output, 'notebook-network-retained.png'), fullPage: false });
  failure = false;
  await page.locator('.ant-alert').filter({ hasText: '访问状态暂时无法更新' }).getByRole('button').click();
  await page.getByText('访问状态暂时无法更新，当前编辑内容已保留').waitFor({ state: 'detached' });
  assert.equal(await text.inputValue(), '未保存的复盘原文应在网络恢复后继续保留');
  assert.equal(reads, initialReads);assert.deepEqual(pageErrors,[],'malformed optional history data must not remove the editor');
  signedOut = true;
  await page.clock.fastForward(2100);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForURL('**/login/**');
  assert.equal(await text.count(), 0);
  await context.close();
  console.log('PASS notebook: background failure preserves real textarea and component instance; explicit 401 removes content');
}

async function focusTest(browser) {
  let preferenceReads = []; let write; let preferences = { keywords: ['原关注'], stocks: [] };
  const context = await mockContext(browser, async (route, url) => {
    if (url.pathname === '/api/news/preferences') {
      if (route.request().method() === 'GET') preferenceReads.push(route);
      else write = route;
      return true;
    }
    if (url.pathname === '/api/news/sources') { await ok(route, { sources: [], collecting: false }); return true; }
    if (url.pathname === '/api/news') { await ok(route, { items: [], total: 0, latestId: 0, newCount: 0, updatedAt: `${date}T10:00:00Z` }); return true; }
    return false;
  });
  const page = await context.newPage();
  await page.goto(`${base}/news/`, { waitUntil: 'domcontentloaded' });
  await wait(() => preferenceReads.length > 0, 'pending preferences');
  const open = page.getByRole('button', { name: '我的关注', exact: true });
  await open.waitFor(); assert.equal(await open.isDisabled(), true);
  for (const route of preferenceReads) await ok(route, preferences).catch(() => {});
  await open.click();
  const keywords = page.getByRole('combobox', { name: '关注关键词（最多 20 个）', exact: true });
  await keywords.fill('新增关注'); await keywords.press('Enter');
  await page.getByRole('button', { name: '保存关注', exact: true }).click();
  await wait(() => !!write, 'preference save');
  assert.equal(await keywords.isDisabled(), true);
  assert.equal(await page.getByRole('combobox', { name: '自选股票（最多 50 只）', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /取\s*消/ }).isDisabled(), true);
  preferences = write.request().postDataJSON();
  assert.deepEqual(preferences.keywords, ['原关注', '新增关注']);
  await page.screenshot({ path: path.join(output, 'focus-save-locked.png'), fullPage: false });
  await ok(write, preferences);
  await page.getByRole('button', { name: '保存关注', exact: true }).waitFor({ state: 'hidden' });
  await open.click();
  await page.locator('.ant-drawer-body').getByText('新增关注', { exact: true }).waitFor();
  await context.close();
  console.log('PASS news focus: late initial read cannot be edited over, save locks editing and persisted values survive reopening');
}

async function requestScopeTest(browser) {
  let revision = 1; let delayed = false; const held = []; const failedMain = [];
  const board = { date, dates: [date], ready: true, items: [{ tsCode: '000001.SZ', name: '测试股票', industries: [{ code: 'I-1', name: '测试行业', type: 'I' }], topics: [], cells: [{ date, state: '首板', height: 1, pctChg: 10, close: 10, amount: 1 }] }] };
  const context = await mockContext(browser, async (route, url) => {
    if (url.pathname === '/api/analysis/market/status') { await ok(route, { revision: String(revision), latestDate: date, expectedDate: date, dates: [date], stages: [], backfill: null }); return true; }
    if (url.pathname === '/api/analysis/market/trajectories') {
      if (delayed) held.push({ route, detail: url.searchParams.get('trajectoryDays') === '1', revision });
      else await ok(route, board);
      return true;
    }
    return false;
  });
  const page = await context.newPage();
  page.on('requestfailed', request => { const url = new URL(request.url()); if (delayed && url.pathname.endsWith('/trajectories') && url.searchParams.get('trajectoryDays') !== '1') failedMain.push(request.failure()?.errorText); });
  await page.goto(`${base}/analysis/chains/?date=${date}&view=trajectory`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: `预览测试股票 ${date} 首板` }).click();
  await page.getByText('测试行业', { exact: true }).waitFor();
  delayed = true; revision = 2;
  await page.evaluate(() => window.__minuteCallbacks.forEach(fn => fn()));
  await wait(() => held.some(row => !row.detail) && held.some(row => row.detail), 'concurrent main and detail refresh');
  const main = held.find(row => !row.detail); const detail = held.find(row => row.detail);
  await ok(main.route, board);
  await ok(detail.route, board);
  await page.getByText('测试行业', { exact: true }).waitFor();
  assert.deepEqual(failedMain, []);
  held.length = 0; revision = 3;
  await page.evaluate(() => window.__minuteCallbacks.forEach(fn => fn()));
  await wait(() => held.some(row => !row.detail) && held.some(row => row.detail), 'third revision refresh');
  await page.locator('.ant-modal-footer').getByRole('button', { name: /关\s*闭/ }).click();
  for (const entry of held) await ok(entry.route, board).catch(() => {});
  await page.getByRole('button', { name: `预览测试股票 ${date} 首板` }).waitFor();
  assert.deepEqual(failedMain, []);
  assert.equal(await page.getByText('请求已取消', { exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, 'market-request-isolation.png'), fullPage: false });
  await context.close();
  console.log('PASS market: concurrent main/detail refresh and detail dismissal never abort the main request');
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  try { await notebookTest(browser); await focusTest(browser); await requestScopeTest(browser); }
  catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: path.join(output, 'resilience-failure.png'), timeout: 5000 }).catch(() => {});
      console.error(page.url(), await page.locator('body').innerText().catch(() => 'No page'));
    }
    throw error;
  }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
