const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const bash = process.platform === 'win32' ? (process.env.TEST_BASH || 'E:/Git/bin/bash.exe') : 'bash';
const image = 'registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-back:' + 'a'.repeat(40);
const script = path.join(__dirname, 'publish-verified-image.sh').replaceAll('\\', '/');
const mock = `
docker() {
  local count=0 file="$TEST_DIR/$1"
  [[ ! -f "$file" ]] || read -r count < "$file"
  count=$((count+1)); printf '%s\\n' "$count" > "$file"
  if [[ "$1" == login ]]; then
    local password; password=$(cat)
    [[ "$password" == "$DOCKER_PASSWORD" ]] || return 99
    (( count > LOGIN_FAILURES ))
  elif [[ "$1" == push ]]; then
    [[ "$2" == "$IMAGE" ]] || return 98
    (( count > PUSH_FAILURES ))
  else return 97; fi
}
timeout() { printf '%s\\n' "$1 $2" >> "$TEST_DIR/timeouts"; shift 2; "$@"; }
sleep() { printf '%s\\n' "$1" >> "$TEST_DIR/sleeps"; }
export -f docker timeout sleep
bash "$TEST_SCRIPT"
`;

function run(overrides = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'stock-publish-test-'));
  try {
    const result = spawnSync(bash, ['-c', mock], {
      encoding: 'utf8', timeout: 15000,
      env: { ...process.env, TEST_DIR: dir.replaceAll('\\', '/'), TEST_SCRIPT: script,
        IMAGE: image, DOCKER_USERNAME: 'fixture-user', DOCKER_PASSWORD: 'fixture-secret',
        LOGIN_FAILURES: '0', PUSH_FAILURES: '0', PUBLISH_ATTEMPTS: '3',
        PUSH_TIMEOUT_SECONDS: '1200', PUBLISH_RETRY_DELAY_SECONDS: '15', ...overrides },
    });
    if (result.error) throw result.error;
    const count = name => { try { return Number(readFileSync(path.join(dir, name), 'utf8')); } catch { return 0; } };
    const output = result.stdout + result.stderr;
    assert.ok(!output.includes('fixture-secret'), 'credentials must not appear in logs');
    return { status: result.status, login: count('login'), push: count('push'), output };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('publishes the exact tagged image with password through stdin', () => {
  const result = run();
  assert.equal(result.status, 0); assert.equal(result.login, 1); assert.equal(result.push, 1);
});
test('recovers from registry login failure and push timeout', () => {
  const result = run({ LOGIN_FAILURES: '1', PUSH_FAILURES: '1' });
  assert.equal(result.status, 0); assert.equal(result.login, 3); assert.equal(result.push, 2);
});
test('failed upload or login stops after the retry limit', () => {
  const upload = run({ PUSH_FAILURES: '9' });
  assert.equal(upload.status, 1); assert.equal(upload.login, 3); assert.equal(upload.push, 3);
  const login = run({ LOGIN_FAILURES: '9' });
  assert.equal(login.status, 1); assert.equal(login.login, 3); assert.equal(login.push, 0);
});
test('rejects mutable tags, missing credentials and unbounded limits before contacting registry', () => {
  for (const overrides of [{ IMAGE: image.replace(/a{40}$/, 'latest') }, { DOCKER_PASSWORD: '' },
    { PUBLISH_ATTEMPTS: '4' }, { PUSH_TIMEOUT_SECONDS: '1201' }, { PUSH_TIMEOUT_SECONDS: '0' },
    { PUBLISH_RETRY_DELAY_SECONDS: '61' }]) {
    const result = run(overrides);
    assert.equal(result.status, 2); assert.equal(result.login, 0); assert.equal(result.push, 0);
  }
});
