const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, () => ({ readApiResponse: async r => r.json(), userError: e => e }));
  return exports;
}
test('private route refuses guests and delegated managers even with matching catalog entries', () => {
  const { allowedPath } = load('auth/client.ts');
  const account = { roles: [{ code: 'user' }], permissions: ['users:manage'], catalog: [{ code: 'users:manage', route: '/admin' }] };
  for (const route of ['/trading-system/', '/trading-system/details', '/admin/playbook']) {
    assert.equal(allowedPath(account, route), false);
    assert.equal(allowedPath(null, route), false);
    assert.equal(allowedPath({ ...account, roles: [{ code: 'admin' }] }, route), true);
    assert.equal(allowedPath({ ...account, guest: true, roles: [{ code: 'admin' }] }, route), false);
  }
});
test('standalone header opens the private route without permission-catalog fallbacks', () => {
  const { homePath } = load('auth/client.ts');
  const account = { roles: [{ code: 'admin' }], permissions: [], catalog: [] };
  assert.equal(homePath(account, '/trading-system'), '/trading-system');
  assert.equal(homePath({ ...account, roles: [{ code: 'user' }] }, '/trading-system'), '/profile');
  assert.equal(homePath(null, '/trading-system'), '/profile');
});
test('search finds instruction text and reveals all ancestors of a hidden node', () => {
  const { searchNodes, ancestorsOf } = load('app/trading-system/model.ts');
  const tree = { id: 'r', title: 'root', children: [{ id: 'b', title: 'branch', children: [{ id: 'l', title: 'leaf', points: ['风险预算'] }] }] };
  assert.deepEqual(searchNodes(tree, '风险').map(n => n.id), ['l']);
  assert.deepEqual(ancestorsOf(tree, 'l'), ['r', 'b']);
  assert.equal(ancestorsOf(tree, 'missing'), null);
  assert.deepEqual(searchNodes(tree, '   '), []);
});
test('XMind export includes UTF-8 topics and full notes in a consistent ZIP directory', () => {
  const { xmindArchive } = load('app/trading-system/xmind.ts');
  const bytes = xmindArchive({ id: 'fixture', title: '测试体系', root: { id: 'root', title: '风险', children: [{ id: 'leaf', title: '预算', points: ['计划损失不等于最大损失'], links: [{ title: 'source', url: 'https://example.com' }] }] } });
  const zip = Buffer.from(bytes);
  let offset = 0;
  const entries = {};
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    entries[name] = JSON.parse(zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size).toString('utf8'));
    offset += 30 + nameLength + size;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt32LE(zip.length - 6), offset);
  assert.equal(zip.readUInt16LE(zip.length - 12), 3);
  assert.equal(entries['content.json'][0].title, '测试体系');
  assert.match(entries['content.json'][0].rootTopic.children.attached[0].notes.plain.content, /计划损失不等于最大损失/);
  assert.ok(entries['manifest.json']['file-entries']['content.json']);
});

test('ZIP checksums match the standard CRC-32 vector', () => {
  const { zipFiles } = load('app/trading-system/xmind.ts');
  const zip = Buffer.from(zipFiles({ 'check.txt': '123456789' }));
  assert.equal(zip.readUInt32LE(14), 0xcbf43926);
  const centralOffset = zip.readUInt32LE(zip.length - 6);
  assert.equal(zip.readUInt32LE(centralOffset + 16), 0xcbf43926);
});
