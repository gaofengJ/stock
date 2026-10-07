"""Exercise release failures using fake Docker/curl, without touching containers."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('deploy.sh')
MOCK = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
cmd = Path(sys.argv[0]).name
a = sys.argv[1:]
mode = os.environ['TEST_MODE']
with open(os.environ['TEST_LOG'], 'a') as f:
    f.write(json.dumps([cmd] + a) + '\n')
if cmd == 'docker':
    if a[0] == 'pull' and mode == 'pull-failure': sys.exit(1)
    if a[:2] == ['image', 'inspect']: print('sha256:new')
    if a[0] == 'inspect':
        print('true' if 'Running' in a[2] else ('sha256:new' if mode == 'unchanged' else 'sha256:old'))
    if a[:2] == ['run', '--rm'] and mode == 'invalid-nginx': sys.exit(1)
    if a[:2] == ['run', '--restart'] and mode == 'start-failure': sys.exit(1)
elif cmd == 'curl':
    print('401' if ':3000/' in a[-1] else ('502' if mode == 'health-failure' else '403'), end='')
'''


class DeployTests(unittest.TestCase):
    def run_mode(self, mode):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for name in ('docker', 'curl', 'flock', 'sleep'):
                file = root / name
                file.write_text(MOCK)
                file.chmod(0o755)
            log = root / 'calls.jsonl'
            env = dict(os.environ, PATH=d + os.pathsep + os.environ['PATH'],
                       TEST_MODE=mode, TEST_LOG=str(log),
                       BLOG_DEPLOY_LOCK=str(root / 'lock'), DOCKER_USERNAME='', DOCKER_PASSWORD='')
            result = subprocess.run(['sh', str(SCRIPT)], env=env, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, universal_newlines=True)
            calls = [json.loads(line) for line in log.read_text().splitlines()]
            return result.returncode, calls

    def test_pull_and_validation_failures_leave_service_running(self):
        for mode in ('pull-failure', 'invalid-nginx'):
            with self.subTest(mode=mode):
                code, calls = self.run_mode(mode)
                self.assertNotEqual(code, 0)
                self.assertFalse(any(c[:2] in (['docker', 'stop'], ['docker', 'rename'], ['docker', 'rm']) for c in calls))

    def test_healthy_switch_pulls_before_stop(self):
        code, calls = self.run_mode('success')
        self.assertEqual(code, 0)
        pull = next(i for i, c in enumerate(calls) if c[:2] == ['docker', 'pull'])
        stop = next(i for i, c in enumerate(calls) if c[:2] == ['docker', 'stop'])
        self.assertLess(pull, stop)
        self.assertFalse(any(c[:2] == ['docker', 'rm'] for c in calls))

    def test_failed_start_and_health_restore_previous_container(self):
        for mode in ('start-failure', 'health-failure'):
            with self.subTest(mode=mode):
                code, calls = self.run_mode(mode)
                self.assertNotEqual(code, 0)
                self.assertIn(['docker', 'rm', '-f', 'stock-blog'], calls)
                backup = next(c[3] for c in calls if c[:3] == ['docker', 'rename', 'stock-blog'])
                self.assertIn(['docker', 'start', backup], calls)
                self.assertIn(['docker', 'rename', backup, 'stock-blog'], calls)

    def test_same_image_does_not_restart(self):
        code, calls = self.run_mode('unchanged')
        self.assertEqual(code, 0)
        self.assertFalse(any(c[:2] == ['docker', 'stop'] for c in calls))


if __name__ == '__main__':
    unittest.main()
