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
    if (fail !== 'missing-env') {
      writeFileSync(
        join(dir, 'release', 'runtime.env'),
        'DB_PASSWORD=test-only',
      );
    }
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
    *" preflight") echo '{"requiredFreeBytes":100,"database":"stock","spaceBudget":{"migrationBytes":0,"reserveBytes":100}}' ;;
    *" client-config") echo '[client]' ;;
    *" migrate") [[ "$FAIL" != migration ]] || return 1 ;;
    *"smoke.cjs") [[ "$FAIL" != smoke ]] || return 1 ;;
    "run --restart"*) [[ "$FAIL" != start ]] || return 1 ;;
    "inspect --format"*) if [[ "$*" == *'.Id'* ]]; then echo 'old-id'; else echo 'old-image'; fi ;;
  esac
  return 0
}
python3() {
  case "$*" in
    *requiredFreeBytes*|*migrationBytes*) echo 100 ;;
    *spaceBudget*) echo '{"migrationBytes":0,"reserveBytes":100}' ;;
    *) echo stock ;;
  esac
}
flock() { return 0; }
df() {
  available=999999999999
  if [[ "$FAIL" == space-before ]] || { [[ "$FAIL" == space-after ]] && [[ -f "$TEST_BACKUP_DONE" ]]; }; then available=0; fi
  printf 'header\\nvolume 999999999999 0 %s 0 path\\n' "$available"
}
mysqldump() { echo 'backup'; touch "$TEST_BACKUP_DONE"; [[ "$FAIL" != backup && "$FAIL" != backup-timing ]]; }
tee() { if [[ "$FAIL" == backup-timing ]]; then cat; return 1; else command tee "$@"; fi; }
sleep() { return 0; }
export -f docker python3 flock df mysqldump sleep tee
`,
    );
    const result = spawnSync(bash, [posix(join(dir, 'release', 'deploy.sh'))], {
      env: {
        ...process.env,
        BASH_ENV: posix(join(dir, 'mocks.sh')),
        RELEASE_SHA: 'a'.repeat(40),
        FAIL: fail,
        TEST_LOG: `${unix}/commands.log`,
        TEST_BACKUP_DONE: `${unix}/backup-done`,
        DOCKER_PASSWORD: '',
      },
      encoding: 'utf8',
      timeout: 15000,
    });
    const log = existsSync(join(dir, 'commands.log'))
      ? readFileSync(join(dir, 'commands.log'), 'utf8')
      : '';
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
  it('配置缺失在接触生产容器之前失败', () => {
    const result = run('missing-env');
    expect(result.status).not.toBe(0);
    expect(result.log).toBe('');
    expect(result.stdout).toContain('phase=runtime-config');
    expect(result.stdout).toContain('status=failed');
  });
  it.each(['backup', 'backup-timing'])(
    '备份失败恢复旧容器，即使计时日志写入失败 %s',
    (fail) => {
      const result = run(fail);
      expect(result.status).not.toBe(0);
      expect(result.log).toContain('docker start old-id');
      expect(result.log).not.toContain('database.cjs migrate');
      expect(result.paused).toBe(false);
      expect(result.stdout).toMatch(
        /TIMING phase=backup-export-compress seconds=\d+ status=failed/,
      );
    },
  );
  it('预检空间不足时保留运行中的旧服务', () => {
    const result = run('space-before');
    expect(result.status).not.toBe(0);
    expect(result.log).not.toContain('docker stop');
    expect(result.log).not.toContain('database.cjs migrate');
  });
  it.each([false, true])(
    '备份后空间不足恢复旧服务和原先暂停状态 %s',
    (paused) => {
      const result = run('space-after', paused);
      expect(result.status).not.toBe(0);
      expect(result.log).toContain('docker start old-id');
      expect(result.log).not.toContain('database.cjs migrate');
      expect(result.paused).toBe(paused);
      expect(result.stdout).toContain(
        'Insufficient migration space after backup',
      );
    },
  );
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
    const containers = result.log
      .split('\n')
      .filter((line) => line.startsWith('docker run '));
    expect(containers.length).toBeGreaterThan(1);
    containers.forEach((command) => {
      expect(command).toContain('dst=/run/stock/runtime.env,readonly');
      expect(command).toContain('-e APP_ENV_FILE=/run/stock/runtime.env');
    });
    expect(result.stdout).toMatch(
      /TIMING phase=backup-checksum seconds=\d+ status=success/,
    );
    expect(result.stdout).not.toContain('DB_PASSWORD');
  });
});
