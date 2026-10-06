"""Exercise installation and rollback in an isolated filesystem with fake systemd."""
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest


@unittest.skipUnless(os.name == 'posix' and shutil.which('bash'), 'Linux installer')
class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.package = self.root / 'package'
        self.package.mkdir()
        self.server = self.root / 'server'
        self.server.mkdir()
        self.config = self.root / 'config'
        self.config.mkdir()
        self.scheduler = self.server / 'scheduler'
        self.scheduler.mkdir()
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        source = Path(__file__).resolve().parent
        for name in ['dispatch.py', 'stock-news-dispatch.service', 'stock-news-dispatch.timer']:
            shutil.copyfile(str(source / name), str(self.package / name))
        script = (source / 'install.sh').read_text().replace('/opt/stock-news', str(self.server))
        script = script.replace('/etc/systemd/system', str(self.config)).replace('/etc/stock-news-dispatch.env', str(self.config / 'credential.env'))
        script = script.replace('[[ "$EUID" == 0 ]]', 'true')
        (self.package / 'install.sh').write_text(script)
        (self.package / 'credential.env').write_text('NEWS_DISPATCH_TOKEN=github_pat_test_' + 'x' * 80 + '\n')
        self.write_command('id', 'exit 0')
        self.write_command('python3', 'if [ "${3:-}" = --check-token ]; then exit 0; fi\nexec ' + shlex.quote(sys.executable) + ' "$@"')
        self.write_command('install', 'args=(); while [ "$#" -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) args+=("$1"); shift ;; esac; done\nexec /usr/bin/install "${args[@]}"')
        self.write_command('systemctl', 'echo "$*" >> "$SYSTEMCTL_LOG"\nif [ "$*" = "start stock-news-dispatch.service" ] && [ "${FAIL_SERVICE:-0}" = 1 ]; then exit 1; fi\nexit 0')
        self.env = dict(os.environ, PATH=str(self.bin) + ':' + os.environ['PATH'], SYSTEMCTL_LOG=str(self.root / 'calls'))

    def write_command(self, name, content):
        path = self.bin / name
        path.write_text('#!/usr/bin/env bash\n' + content + '\n')
        os.chmod(str(path), 0o755)

    def tearDown(self):
        self.temporary.cleanup()

    def run_installer(self, fail=False):
        self.env['FAIL_SERVICE'] = '1' if fail else '0'
        process = subprocess.Popen(['bash', str(self.package / 'install.sh')], env=self.env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        output = process.communicate()[0].decode('utf-8')
        self.assertNotIn('github_pat_test_', output)
        self.assertFalse((self.package / 'credential.env').exists())
        self.assertFalse(list(self.server.glob('.scheduler-backup.*')))
        return process.returncode, output

    def test_success_installs_private_credential_and_starts_timer(self):
        code, output = self.run_installer()
        self.assertEqual(code, 0, output)
        self.assertEqual((self.config / 'credential.env').stat().st_mode & 0o777, 0o600)
        self.assertIn('enable --now stock-news-dispatch.timer', (self.root / 'calls').read_text())
        self.assertTrue((self.scheduler / 'dispatch.py').exists())

    def test_failed_first_trigger_restores_previous_installation(self):
        files = [self.scheduler / 'dispatch.py', self.config / 'credential.env', self.config / 'stock-news-dispatch.service', self.config / 'stock-news-dispatch.timer']
        for path in files:
            path.write_text('previous configuration')
            os.chmod(str(path), 0o600)
        code, output = self.run_installer(fail=True)
        self.assertNotEqual(code, 0, output)
        for path in files:
            self.assertEqual(path.read_text(), 'previous configuration')
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertIn('start stock-news-dispatch.timer', (self.root / 'calls').read_text())

    def test_failed_new_install_leaves_no_timer_or_credential(self):
        code, output = self.run_installer(fail=True)
        self.assertNotEqual(code, 0, output)
        self.assertFalse((self.config / 'credential.env').exists())
        self.assertFalse((self.config / 'stock-news-dispatch.timer').exists())


if __name__ == '__main__':
    unittest.main()
