const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'review-proxy-'));
const name = `stock-review-proxy-${process.pid}`;
const configuration = `events {} http {
  access_log off;
  server { listen 3000; client_max_body_size 8m; add_header X-Inherited $http_x_original always; return 401; }
  server { listen 8080; server_name stock.mufengtongxue.com;
    location /health { return 200; }
    location /api { proxy_set_header X-Original preserved; proxy_pass http://127.0.0.1:3000; }
  }
}`;
(async () => {
  try {
    fs.writeFileSync(path.join(directory, 'before.conf'), configuration);
    execFileSync('python3', ['apps/back/ops/release/review-proxy.py', '--config', path.join(directory, 'before.conf'), '--output', path.join(directory, 'nginx.conf')], {stdio: 'inherit'});
    execFileSync('docker', ['run', '--rm', '-d', '--name', name, '-p', '127.0.0.1:38187:8080', '--mount', `type=bind,src=${path.join(directory, 'nginx.conf')},dst=/etc/nginx/nginx.conf,readonly`, 'nginx:stable-alpine'], {stdio: 'inherit', timeout: 120000});
    let ready = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try { ready = (await fetch('http://127.0.0.1:38187/health', {signal: AbortSignal.timeout(1000)})).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'nginx started with the generated configuration');
    for (const route of ['/api/review/notebook', '/api/review/notebook/']) {
      const result = await fetch(`http://127.0.0.1:38187${route}`, {method: 'POST', body: 'x'.repeat(2 * 1024 * 1024)});
      assert.equal(result.status, 401, 'large notebook body reaches the existing upstream authorization');
      assert.equal(result.headers.get('x-inherited'), 'preserved', 'existing API headers remain inherited');
      await result.arrayBuffer();
    }
    for (const [route, bytes] of [['/api/other', 2 * 1024 * 1024], ['/api/review/notebook', 9 * 1024 * 1024]]) {
      const result = await fetch(`http://127.0.0.1:38187${route}`, {method: 'POST', body: 'x'.repeat(bytes)});
      assert.equal(result.status, 413, 'other routes and oversized notebooks remain bounded');
      await result.arrayBuffer();
    }
    console.log('Real nginx verified: scoped size limit, upstream authorization and header inheritance.');
  } finally {
    try { execFileSync('docker', ['rm', '-f', name], {stdio: 'ignore'}); } catch {}
    fs.rmSync(directory, {recursive: true, force: true});
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
