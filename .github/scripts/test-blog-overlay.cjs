const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cleanup = path.join(__dirname, 'clean-blog-overlay.sh');

function fixture(run) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-overlay-'));
  try {
    const site = path.join(temp, 'site');
    fs.mkdirSync(path.join(site, 'imgs'), { recursive: true });
    fs.writeFileSync(path.join(site, 'deleted.html'), 'old article');
    fs.writeFileSync(path.join(site, 'imgs/图 表.webp'), 'unchanged media');
    const manifest = path.join(temp, 'media-files.txt');
    fs.writeFileSync(manifest, 'imgs/图 表.webp\n');
    run({ temp, site, manifest, execute: () => spawnSync('sh', [cleanup, site, manifest], { encoding: 'utf8' }) });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
test('deleted articles and stale assets disappear while listed media is unchanged', () => fixture(({ site, execute }) => {
  fs.writeFileSync(path.join(site, 'old.js'), 'obsolete chunk');
  fs.mkdirSync(path.join(site, 'removed-article'));
  fs.writeFileSync(path.join(site, 'removed-article/index.html'), 'old directory article');
  fs.writeFileSync(path.join(site, 'imgs/removed.webp'), 'removed media');
  const result = execute();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(site, 'deleted.html')), false);
  assert.equal(fs.existsSync(path.join(site, 'old.js')), false);
  assert.equal(fs.existsSync(path.join(site, 'removed-article')), false);
  assert.equal(fs.existsSync(path.join(site, 'imgs/removed.webp')), false);
  assert.equal(fs.readFileSync(path.join(site, 'imgs/图 表.webp'), 'utf8'), 'unchanged media');
}));
test('unsafe, missing or empty manifests fail before modifying old articles', () => {
  for (const entry of ['../outside\n', '/etc/passwd\n', 'missing.webp\n', '']) fixture(({ site, manifest, execute }) => {
    fs.writeFileSync(manifest, entry);
    assert.notEqual(execute().status, 0);
    assert.equal(fs.readFileSync(path.join(site, 'deleted.html'), 'utf8'), 'old article');
  });
});
test('symlinks cannot retain or delete files outside the site', () => fixture(({ temp, site, execute }) => {
  const outside = path.join(temp, 'outside');
  fs.writeFileSync(outside, 'preserve');
  fs.symlinkSync(outside, path.join(site, 'link'));
  assert.notEqual(execute().status, 0);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve');
  assert.equal(fs.existsSync(path.join(site, 'deleted.html')), true);
}));
