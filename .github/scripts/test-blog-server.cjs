// Run on the Linux CI runner: exercise the actual Nginx config against a
// backend stand-in, including direct routes, content chunks and search data.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-blog-check-'));
const name = `stock-blog-check-${process.pid}`;
const site = path.join(tmp, 'site');
fs.mkdirSync(site, { recursive: true });
for (const file of ['index.html', 'article.html', 'assets/content.js', 'pagefind/index.pf_fragment', 'imgs/chart.webp']) {
  fs.mkdirSync(path.dirname(path.join(site, file)), { recursive: true });
  fs.writeFileSync(path.join(site, file), 'protected article content');
}
let calls = 0;
const backend = http.createServer((req, res) => {
  assert.equal(req.url, '/api/auth/blog-access');
  calls++;
  const cookie = req.headers.cookie || '';
  res.statusCode = /session=reader|trial=active/.test(cookie) ? 200 : cookie ? 403 : 401;
  res.end();
});
async function main() {
  await new Promise(resolve => backend.listen(3000, '0.0.0.0', resolve));
  execFileSync('docker', ['run', '-d', '--name', name, '-p', '127.0.0.1:36082:80', '--mount', `type=bind,src=${path.resolve('apps/blog/blog.nginx.conf')},dst=/etc/nginx/conf.d/default.conf,readonly`, '--mount', `type=bind,src=${site},dst=/usr/share/nginx/html,readonly`, 'nginx:stable-alpine'], { stdio: 'inherit' });
  execFileSync('docker', ['exec', name, 'nginx', '-t'], { stdio: 'inherit' });
  const request = (url, cookie) => fetch(`http://127.0.0.1:36082${url}`, { headers: cookie ? { Cookie: cookie } : {} });
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await request('/'); break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  for (const url of ['/article', '/article.html', '/blog-frame/article', '/assets/content.js', '/pagefind/index.pf_fragment', '/imgs/chart.webp']) {
    const denied = await request(url);
    assert.equal(denied.status, 403, url);
    assert.ok(!(await denied.text()).includes('protected article content'));
    assert.match(denied.headers.get('cache-control'), /no-store/);
    const allowed = await request(url, 'session=reader');
    assert.equal(allowed.status, 200, url);
    assert.equal(await allowed.text(), 'protected article content');
    assert.match(allowed.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await request('/article', 'trial=active')).status, 200);
  assert.equal((await request('/article', 'trial=expired')).status, 403);
  assert.equal((await request('/article', 'session=other-role')).status, 403);
  assert.equal((await request('/missing', 'session=reader')).status, 404);
  assert.equal((await request('/_blog_access', 'session=reader')).status, 404);
  assert.ok(calls >= 15, 'Resource requests always re-check permission');
  await new Promise(resolve => backend.close(resolve));
  assert.equal((await request('/article', 'session=reader')).status, 500, 'Backend failure denies access');
  console.log('Article routing and resource permissions verified.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  backend.close();
  try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch { /* Container may not have started. */ }
  fs.rmSync(tmp, { recursive: true, force: true });
});
