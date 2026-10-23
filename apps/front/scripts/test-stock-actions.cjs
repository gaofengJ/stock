const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', code)((name) => Object.hasOwn(imports, name) ? imports[name] : require(name), exports);
  return exports;
}
const auth = load('auth/client.ts', { '@/api/errors': {}, '@/components/Layout/enum': load('components/Layout/enum.ts'), './request-deadline': load('auth/request-deadline.ts') });
const stock = load('utils/stock-interaction.ts');
const navigation = load('components/StockActions/list-navigation.ts', { '@/utils/stock-interaction': stock });
const { tableNavigationRows } = load('components/DataTable/navigation.ts');
const { chartShortcut } = load('app/strategy/chart-shortcuts.ts');
const account = (permissions) => ({
  permissions, catalog: [{ code: 'basic:stock', route: '/basic/stock' }],
});

test('copy symbols retain six digits for Shanghai, Shenzhen and Beijing', () => {
  for (const [code, expected] of [['000503.SZ', '000503'], ['603418.SH', '603418'], ['920001.BJ', '920001']]) {
    assert.equal(stock.validStockCode(code), true);
    assert.equal(stock.stockSymbol(code), expected);
  }
  for (const code of ['', '000503', '503.SZ', '000503.HK', '000503.SZ&date=bad']) assert.equal(stock.validStockCode(code), false);
});
test('detail links retain the full identity and only valid observation dates', () => {
  const url = new URL(stock.stockHref('000503.SZ', '2026-10-06'), 'https://example.test');
  assert.equal(url.pathname, '/basic/stock/detail/');
  assert.equal(url.searchParams.get('code'), '000503.SZ');
  assert.equal(url.searchParams.get('date'), '2026-10-06');
  for (const date of [undefined, '', '2026-02-30', '2026-10-06&code=603418.SH', 'oops']) {
    assert.equal(new URL(stock.stockHref('000503.SZ', date), 'https://example.test').searchParams.has('date'), false);
  }
});
test('chart access matches the backend endpoint permission union', () => {
  for (const permission of ['strategy:read', 'basic:stock', 'review:read']) assert.equal(stock.canViewStockChart(account([permission])), true);
  for (const user of [null, account([]), account(['market:read'])]) assert.equal(stock.canViewStockChart(user), false);
});

function renderMenu(props, permissions = ['basic:stock'], rows = []) {
  const calls = [];
  const module = load('components/StockActions/index.tsx', {
    react: { ...React, useState: () => [false, () => {}], useRef: () => ({ current: null }) },
    antd: { Button: 'button', Popover: 'popover', Tooltip: 'tooltip' },
    '@ant-design/icons': { CopyOutlined: 'icon', EyeOutlined: 'icon', FileTextOutlined: 'icon' },
    'next/link': { __esModule: true, default: 'link' },
    '@/components/Interaction': { __esModule: true, default: 'link', InteractionButton: 'button' },
    '@/auth/Boundary': { useAccount: () => ({ user: account(permissions) }) },
    '@/auth/client': auth,
    '@/components/ResearchCollection': { CollectButton: 'collect-button' },
    '@/utils/stock-interaction': stock,
    './context': { useStockActions: () => ({ openChart: (value, source) => calls.push(['chart', value, source]), copyCode: (value) => calls.push(['copy', value]) }) },
    './ListScope': { useStockList: () => () => rows },
    './stock-actions.css': {},
  });
  const element = module.default(props);
  function find(label, current = element.props.content) {
    if (!current) return undefined;
    if (current.props?.['aria-label'] === label || current.props?.children === label) return current;
    for (const child of React.Children.toArray(current.props?.children)) {
      const result = find(label, child);
      if (result) return result;
    }
    return undefined;
  }
  return { element, find, calls };
}
test('one menu exposes detail, chart and copy while preserving the page date', () => {
  const menu = renderMenu({ code: '000503.SZ', name: '国新健康', date: '2026-10-06' });
  assert.deepEqual(menu.element.props.trigger, ['hover', 'click']);
  assert.equal(new URL(menu.find('个股详情').props.href, 'https://example.test').searchParams.get('date'), '2026-10-06');
  menu.find('预览K线').props.onClick();
  menu.find('复制代码').props.onClick();
  assert.deepEqual(menu.calls, [['chart', { code: '000503.SZ', name: '国新健康', date: '2026-10-06' }, []], ['copy', '000503.SZ']]);
});
test('strategy previews use the existing signal chart callback and navigation', () => {
  let calls = 0;
  const menu = renderMenu({ code: '000503.SZ', onChart: () => { calls += 1; } });
  menu.find('预览K线').props.onClick();
  assert.equal(calls, 1);
  assert.deepEqual(menu.calls, []);
});
test('restricted accounts keep copying available without denied detail/chart requests', () => {
  const menu = renderMenu({ code: '000503.SZ' }, []);
  assert.equal(menu.find('个股详情').props.disabled, true);
  assert.equal(menu.find('预览K线').props.disabled, true);
  assert.equal(menu.find('复制代码').props.disabled, undefined);
});
test('the chart menu prevents opening a second copy of the same chart', () => {
  assert.equal(renderMenu({ code: '000503.SZ', chartOpen: true }).find('预览K线').props.disabled, true);
});

test('detail navigation dismisses an existing chart even when the destination page is unchanged', () => {
  let closed = 0;
  const menu = renderMenu({ code: '000503.SZ', chartOpen: true, onDetails: () => { closed += 1; } });
  menu.find('个股详情').props.onClick();
  assert.equal(closed, 1);
  assert.match(menu.find('个股详情').props.href, /code=000503\.SZ/);
  assert.deepEqual(menu.calls, []);
});
test('invalid stock identities do not offer navigation or clipboard actions', () => {
  const menu = renderMenu({ code: 'bad', label: '未知股票' });
  assert.equal(menu.element.type, 'span');
  assert.equal(menu.element.props.children, '未知股票');
});

function provider(copySucceeded) {
  const states = []; const copied = []; const messages = [];
  const module = load('components/StockActions/Provider.tsx', {
    react: { ...React, useState: (initial) => [initial, (value) => states.push(value)], useEffect: () => {}, useCallback: (fn) => fn, useMemo: (fn) => fn() },
    'next/navigation': { usePathname: () => '/analysis/limits/' },
    'next/dynamic': () => 'chart',
    antd: { Alert: 'alert', Button: 'button', Input: 'input', Modal: 'modal', message: { useMessage: () => [{ success: (text) => messages.push(text) }, null] } },
    '@/components/Loading': () => null,
    '@/hooks/useDefaultTradeDate': { useDefaultTradeDate: (enabled) => { assert.equal(enabled, false); return { ready: false }; } },
    '@/app/strategy/strategy-options': { trendDefaults: {} },
    '@/utils/clipboard': { copyText: async (text) => { copied.push(text); return copySucceeded; } },
    '@/utils/stock-interaction': stock,
    './list-navigation': navigation,
    './context': { StockActionContext: { Provider: 'provider' } },
  });
  return { actions: module.default({ children: null }).props.value, copied, states, messages };
}
test('the shared clipboard action copies only six digits, never exchange suffixes', async () => {
  const p = provider(true);
  for (const code of ['000503.SZ', '603418.SH', '920001.BJ']) await p.actions.copyCode(code);
  await p.actions.copyCode('invalid');
  assert.deepEqual(p.copied, ['000503', '603418', '920001']);
  assert.equal(p.messages.length, 3);
  assert.deepEqual(p.states, []);
});
test('manual copy fallback also contains only six digits', async () => {
  const p = provider(false);
  await p.actions.copyCode('000503.SZ');
  assert.deepEqual(p.states, ['000503']);
  assert.deepEqual(p.messages, []);
});
test('chart selection validates the identity and date before setting shared state', () => {
  const p = provider(true);
  p.actions.openChart({ code: '000503.SZ', date: '2026-02-30' });
  p.actions.openChart({ code: '920001.BJ', date: '2026-10-06' });
  p.actions.openChart({ code: 'invalid' });
  assert.deepEqual(p.states, [{ code: '000503.SZ', date: undefined, navigation: [] }, { code: '920001.BJ', date: '2026-10-06', navigation: [] }]);
});

test('table and explicit card/tag lists reach the shared chart and custom strategy callbacks', () => {
  const rows = [{ tsCode: '603418.SH', name: 'A' }, { tsCode: '000503.SZ', name: 'B' }];
  const menu = renderMenu({ code: '000503.SZ', date: '2026-10-06' }, ['basic:stock'], rows);
  menu.find('预览K线').props.onClick();
  assert.equal(menu.calls[0][2], rows);
  let received;
  const custom = renderMenu({ code: '000503.SZ', onChart: source => { received = source; } }, ['strategy:read'], rows);
  custom.find('预览K线').props.onClick();
  assert.deepEqual(received, rows);
  const explicit = renderMenu({ code: '000503.SZ', navigation: rows }, ['basic:stock'], [{ code: '920001.BJ' }]);
  explicit.find('预览K线').props.onClick();
  assert.equal(explicit.calls[0][2], rows);
});

test('navigation keeps source order, exchanges and per-signal dates, but rejects unrelated and invalid rows', () => {
  const rows = [{ ts_code: '920001.BJ', name: '北交股票' }, { code: 'bad' }, { ts_code: '510300.SH', name: '混合榜单中的ETF' }, { tsCode: '000503.SZ', date: '2026-10-06' }, { code: '000503.SZ', date: '2026-10-07' }, { code: '000503.SZ', date: '2026-10-07' }, null];
  const current = { code: '000503.SZ', date: '2026-10-06' };
  assert.deepEqual(navigation.stockChartNavigation(rows, current).map(row => [row.code, row.date]), [['920001.BJ', '2026-10-06'], ['000503.SZ', '2026-10-06'], ['000503.SZ', '2026-10-07']]);
  assert.deepEqual(navigation.stockChartNavigation(rows, { code: '603418.SH', date: '2026-10-06' }), []);
  assert.deepEqual(navigation.stockChartNavigation([{ code: '000503.SZ' }], { code: '000503.SZ' }), [{ code: '000503.SZ', name: undefined, date: undefined }]);
  const p = provider(true);
  p.actions.openChart(current, rows);
  assert.deepEqual(p.states[0].navigation, navigation.stockChartNavigation(rows, current));
});

test('table chart order follows sorting, filters, defaults and refreshed data without changing the source', () => {
  const columns = [{ key: 'change', sorter: (a, b) => a.change - b.change, defaultSortOrder: 'descend' }, { key: 'group', onFilter: (value, row) => row.group === value, defaultFilteredValue: ['first'] }];
  const source = [{ code: '000503.SZ', change: -5, group: 'first' }, { code: '603418.SH', change: 8, group: 'first' }, { code: '920001.BJ', change: 10, group: 'other' }];
  const codes = rows => rows.map(row => row.code);
  assert.deepEqual(codes(tableNavigationRows(source, columns)), ['603418.SH', '000503.SZ']);
  const view = { filters: { group: ['first'] }, sorter: { columnKey: 'change', order: 'ascend' } };
  assert.deepEqual(codes(tableNavigationRows(source, columns, view)), ['000503.SZ', '603418.SH']);
  const refreshed = source.map(row => ({ ...row, change: -row.change }));
  assert.deepEqual(codes(tableNavigationRows(refreshed, columns, view)), ['603418.SH', '000503.SZ']);
  assert.deepEqual(codes(tableNavigationRows(source, columns, { filters: { group: null }, sorter: {} })), codes(source));
  assert.deepEqual(codes(source), ['000503.SZ', '603418.SH', '920001.BJ']);
  assert.deepEqual(codes(tableNavigationRows(source, [{ ...columns[0], sortOrder: 'ascend' }], { filters: {}, sorter: { columnKey: 'change', order: 'descend' } })), ['000503.SZ', '603418.SH', '920001.BJ']);
});

test('chart arrows only act in the focused chart and leave forms, menus, other dialogs and modified keys alone', () => {
  const original = global.HTMLElement;
  class Target { constructor(blocked = false) { this.blocked = blocked; } closest() { return this.blocked ? {} : null; } }
  global.HTMLElement = Target;
  try {
    const target = new Target();
    const dialog = { contains: value => value === target || value.blocked };
    const chart = { closest: () => dialog };
    const event = { target, key: 'ArrowDown' };
    assert.deepEqual(chartShortcut(event, chart), { kind: 'stock', direction: 1 });
    assert.deepEqual(chartShortcut({ ...event, key: 'ArrowUp' }, chart), { kind: 'stock', direction: -1 });
    assert.deepEqual(chartShortcut({ ...event, key: 'ArrowLeft' }, chart), { kind: 'time', direction: -1 });
    assert.deepEqual(chartShortcut({ ...event, key: 'ArrowRight' }, chart), { kind: 'time', direction: 1 });
    for (const flag of ['defaultPrevented', 'isComposing', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) assert.equal(chartShortcut({ ...event, [flag]: true }, chart), null);
    assert.equal(chartShortcut({ ...event, target: new Target() }, chart), null);
    assert.equal(chartShortcut({ ...event, target: new Target(true) }, chart), null);
    assert.equal(chartShortcut(event, null), null);
    assert.equal(chartShortcut({ ...event, key: 'Escape' }, chart), null);
  } finally { global.HTMLElement = original; }
});
