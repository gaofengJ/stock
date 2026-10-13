"""Execute the release state machine with local command doubles only."""
import os
import pathlib
import subprocess
import tempfile
import unittest


class BackendReleaseTests(unittest.TestCase):
    def fixture(self, failure='', mode='application'):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = pathlib.Path(temp.name).resolve()
        release = root/'release'
        package = release/'packages'/('a'*40)
        scripts = package/'release'
        scripts.mkdir(parents=True)
        target = root/'stock-test'
        target.mkdir()
        (root/'systemd').mkdir()
        (package/'test-db').mkdir()
        for name in ('refresh.cjs', 'history-refresh.cjs', 'refresh.py'):
            (target/name).write_text('old-'+name)
            (package/'test-db'/name).write_text('new-'+name)
        source = pathlib.Path(__file__).parent
        for name in ('deploy.sh', 'post-deploy.sh', 'resume-post-deploy.sh'):
            text = (source/name).read_text().replace('/opt/stock-release', str(release)).replace('/var/lock', str(root)).replace('/opt/stock-test', str(target)).replace('/opt/stock-news', str(root/'news')).replace('/etc/systemd/system', str(root/'systemd'))
            (scripts/name).write_text(text)
        for name in ('backup.sh', 'daily-backup.sh', 'maintenance.py', 'stock-release-backup.service', 'stock-release-backup.timer'):
            (scripts/name).write_text('fixture')
        (scripts/'runtime.env').write_text('fixture')
        (root/'mocks.sh').write_text(r'''
docker() {
  echo "docker $*" >> "$TEST_LOG"
  case "$*" in
    'network inspect bridge'*) echo '[{"Gateway":"172.17.0.1"}]' ;;
    'network inspect stock-news'*) return 1 ;;
    'inspect --format {{.Id}}'*) echo old-id ;;
    'inspect --format {{.Image}}'*) echo old-image ;;
    'inspect --format {{.State.Running}}'*) echo true ;;
    'inspect --format {{index .Config.Labels'* ) echo "$RELEASE_SHA" ;;
    'inspect --format {{range .Mounts'* ) echo "$RUNTIME" ;;
    'inspect '*) echo '[]' ;;
    'run --rm '*'database.cjs preflight') echo '{"requiredFreeBytes":1,"database":"stock","releaseMode":"'"$MODE"'","spaceBudget":{"migrationBytes":1,"reserveBytes":1}}' ;;
    'run --rm '*'database.cjs migrate') [[ "$FAIL" != migrate ]] ;;
    'run --rm '*'database.cjs enqueue-market') [[ "$FAIL" != enqueue ]] ;;
    'run --restart '*) [[ "$FAIL" != start ]] ;;
    'exec stock-back node ops/release/smoke.cjs') [[ "$FAIL" != smoke ]] ;;
  esac
}
python3() {
  case "$*" in
    *review-proxy.py*) return 0 ;;
    *maintenance.py*) echo '{}' ;;
    *) command python3 "$@" ;;
  esac
}
install() {
  if [[ "$FAIL" == refresh-install && "$*" == *history-refresh.cjs* ]]; then return 1; fi
  command install "$@"
}
systemctl() { echo "systemctl $*" >> "$TEST_LOG"; [[ "$*" != daemon-reload || "$FAIL" != timer ]]; }
curl() { echo 401; }
df() { printf 'header\nvolume 9999999 0 9999999 0 path\n'; }
stat() { echo 20; }
sha256sum() { echo fixture-checksum; }
mysqldump() { echo 'CREATE TABLE fixture(id int);'; }
flock() { return 0; }
sleep() { return 0; }
export -f docker python3 install systemctl curl df stat sha256sum mysqldump flock sleep
''')
        env = dict(os.environ, BASH_ENV=str(root/'mocks.sh'), TEST_LOG=str(root/'calls'), FAIL=failure,
                   MODE=mode, RELEASE_SHA='a'*40, RUNTIME=str(scripts/'runtime.env'))
        return root, release, scripts, target, env

    def execute(self, scripts, env, script='deploy.sh', args=None):
        return subprocess.run(['bash', str(scripts/script)]+(args or []), env=env,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              universal_newlines=True, timeout=20)

    def test_post_verification_failures_keep_service_and_can_resume(self):
        for mode in ('application', 'migration'):
            for failure in ('enqueue', 'timer'):
                with self.subTest(mode=mode, failure=failure):
                    root, release, scripts, target, env = self.fixture(failure, mode)
                    result = self.execute(scripts, env)
                    self.assertNotEqual(result.returncode, 0)
                    calls = (root/'calls').read_text()
                    self.assertNotIn('docker stop stock-back\n', calls)
                    self.assertNotIn('docker start old-id', calls)
                    run = next((release/'runs').iterdir())
                    self.assertEqual((run/'phase').read_text().strip(), 'post-deploy-pending')
                    (root/'calls').write_text('')
                    result = self.execute(scripts, dict(env, FAIL=''), 'resume-post-deploy.sh', [str(run)])
                    self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
                    self.assertEqual((run/'phase').read_text().strip(), 'success')
                    self.assertNotIn('docker stop', (root/'calls').read_text())
                    self.assertNotIn('docker run --restart', (root/'calls').read_text())
                    if failure == 'timer':
                        self.assertNotIn('database.cjs enqueue-market', (root/'calls').read_text())

    def test_pre_verification_failure_restores_all_refresh_files(self):
        for failure in ('refresh-install', 'start', 'smoke'):
            with self.subTest(failure=failure):
                root, release, scripts, target, env = self.fixture(failure)
                result = self.execute(scripts, env)
                self.assertNotEqual(result.returncode, 0)
                for name in ('refresh.cjs', 'history-refresh.cjs', 'refresh.py'):
                    self.assertEqual((target/name).read_text(), 'old-'+name)
                self.assertFalse((target/'PAUSED').exists())

    def test_failed_migration_keeps_refresh_paused_and_never_starts_old(self):
        root, release, scripts, target, env = self.fixture('migrate', 'migration')
        result = self.execute(scripts, env)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((target/'PAUSED').exists())
        self.assertNotIn('docker start old-id', (root/'calls').read_text())

    def test_operator_pause_survives_success_and_resume(self):
        root, release, scripts, target, env = self.fixture()
        (target/'PAUSED').touch()
        result = self.execute(scripts, env)
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertTrue((target/'PAUSED').exists())


class BackupLockTests(unittest.TestCase):
    def test_lock_exhaustion_fails_after_three_bounded_waits(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            script = (pathlib.Path(__file__).parent/'daily-backup.sh').read_text().replace('/var/lock', str(root))
            (root/'daily.sh').write_text(script)
            (root/'mocks.sh').write_text('flock() { echo "$*" >> "$TEST_LOG"; return 1; }; sleep() { :; }; export -f flock sleep\n')
            env = dict(os.environ, BASH_ENV=str(root/'mocks.sh'), TEST_LOG=str(root/'calls'))
            result = subprocess.run(['bash', str(root/'daily.sh')], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
            self.assertEqual(result.returncode, 75)
            self.assertEqual((root/'calls').read_text().splitlines(), ['-w 900 9']*3)
