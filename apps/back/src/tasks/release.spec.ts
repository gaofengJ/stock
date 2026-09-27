import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const bash = process.platform === 'win32' ? 'E:/Git/bin/bash.exe' : '/bin/bash';
const shellDescribe = existsSync(bash) ? describe : describe.skip;
const posix = (value: string) =>
  value
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

shellDescribe('发布脚本故障恢复', () => {
  function run(fail: string, paused = false) {
    const dir = mkdtempSync(join(tmpdir(), 'stock-release-test-'));
    const unix = posix(dir);
    ['release', 'test-db', 'stock-test', 'locks'].forEach((name) =>
      mkdirSync(join(dir, name)),
    );
    ['test-db', 'stock-test'].forEach((name) => {
      writeFileSync(join(dir, name, 'refresh.cjs'), 'fixture');
      writeFileSync(join(dir, name, 'history-refresh.cjs'), 'fixture');
      writeFileSync(join(dir, name, 'refresh.py'), 'fixture');
    });
    if (paused) writeFileSync(join(dir, 'stock-test', 'PAUSED'), '');
    const script = readFileSync(
      resolve(__dirname, '../../ops/release/deploy.sh'),
      'utf8',
    )
      .replace('/opt/stock-release', `${unix}/runs`)
      .replace(/\/opt\/stock-test/g, `${unix}/stock-test`)
      .replace(/\/var\/lock/g, `${unix}/locks`);
    writeFileSync(join(dir, 'release', 'deploy.sh'), script);
    writeFileSync(
      join(dir, 'mocks.sh'),
      `
docker() {
  echo "docker $*" >> "$TEST_LOG"
  case "$*" in
    "pull "*) [[ "$FAIL" != pull ]] || return 1 ;;
    *" preflight") echo '{"requiredFreeBytes":1,"database":"stock"}' ;;
    *" client-config") echo '[client]' ;;
    *" migrate") [[ "$FAIL" != migration ]] || return 1 ;;
    *"smoke.cjs") [[ "$FAIL" != smoke ]] || return 1 ;;
    "run --restart"*) [[ "$FAIL" != start ]] || return 1 ;;
    "inspect --format"*) if [[ "$*" == *'.Id'* ]]; then echo 'old-id'; else echo 'old-image'; fi ;;
  esac
  return 0
}
python3() { if [[ "$*" == *requiredFreeBytes* ]]; then echo 1; else echo stock; fi; }
flock() { return 0; }
df() { printf 'header\\nvolume 999999999999 0 999999999999 0 path\\n'; }
mysqldump() { echo 'backup'; [[ "$FAIL" != backup ]]; }
sleep() { return 0; }
export -f docker python3 flock df mysqldump sleep
`,
    );
    const result = spawnSync(bash, [posix(join(dir, 'release', 'deploy.sh'))], {
      env: {
        ...process.env,
        BASH_ENV: posix(join(dir, 'mocks.sh')),
        RELEASE_SHA: 'a'.repeat(40),
        FAIL: fail,
        TEST_LOG: `${unix}/commands.log`,
        DOCKER_PASSWORD: '',
      },
      encoding: 'utf8',
      timeout: 15000,
    });
    const log = readFileSync(join(dir, 'commands.log'), 'utf8');
    return {
      ...result,
      log,
      paused: existsSync(join(dir, 'stock-test', 'PAUSED')),
    };
  }

  it('拉取失败不停止生产容器', () => {
    const result = run('pull');
    expect(result.status).not.toBe(0);
    expect(result.log).not.toContain('docker stop');
  });
  it('备份失败恢复旧容器和刷新状态，不执行迁移', () => {
    const result = run('backup');
    expect(result.status).not.toBe(0);
    expect(result.log).toContain('docker start old-id');
    expect(result.log).not.toContain('database.cjs migrate');
    expect(result.paused).toBe(false);
  });
  it('迁移中断保留现场，不自动降级，保持刷新暂停', () => {
    const result = run('migration');
    expect(result.status).not.toBe(0);
    expect(result.log).toContain('database.cjs migrate');
    expect(result.log).not.toContain('docker start ');
    expect(result.paused).toBe(true);
  });
  it.each(['smoke', 'start'])(
    '新版接口或启动命令失败停止新版 %s',
    (failure) => {
      const result = run(failure);
      expect(result.status).not.toBe(0);
      expect(result.log).toContain('docker stop stock-back');
      expect(result.stdout).not.toContain('Deployment verified');
      expect(result.log).not.toContain('docker start ');
    },
  );
  it.each([false, true])('发布成功保留原先暂停状态 %s', (paused) => {
    const result = run('', paused);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Deployment verified');
    expect(result.paused).toBe(paused);
    expect(result.log).not.toMatch(/docker (rm|rmi) /);
  });
});
