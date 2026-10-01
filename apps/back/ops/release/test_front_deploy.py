import copy
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

from importlib.machinery import SourceFileLoader

front = SourceFileLoader('front_config', str(pathlib.Path(__file__).parent/'front-config.py')).load_module()


class FrontConfigTests(unittest.TestCase):
    def test_runtime_ports_mounts_and_overrides_survive_image_upgrade(self):
        defaults = {'Env': ['BASE=old'], 'Cmd': ['nginx'], 'Entrypoint': ['/entrypoint']}
        old = {'HostConfig': {'PortBindings': {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '8187'}]},
                'RestartPolicy': {'Name': 'unless-stopped'}, 'NetworkMode': 'bridge', 'ExtraHosts': ['api:127.0.0.1']},
            'Config': dict(defaults, Env=['BASE=old', 'CUSTOM=value']),
            'Mounts': [{'Type': 'bind', 'Source': '/home/config', 'Destination': '/etc/nginx/custom.conf', 'RW': False}]}
        args = front.command(old, defaults, 'new-image', 'a'*40)
        self.assertIn('127.0.0.1:8187:80/tcp', args)
        self.assertIn('type=bind,src=/home/config,dst=/etc/nginx/custom.conf,readonly', args)
        self.assertIn('CUSTOM=value', args)
        self.assertNotIn('BASE=old', args)
        self.assertEqual(args[-1], 'new-image')
        bad = copy.deepcopy(old)
        bad['Config']['Entrypoint'] = ['custom']
        with self.assertRaises(ValueError):
            front.command(bad, defaults, 'new-image', 'a'*40)


@unittest.skipUnless(os.name != 'nt' and shutil.which('bash'), 'Linux bash fixture')
class FrontDeploymentTests(unittest.TestCase):
    def run_release(self, failure):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            script = (pathlib.Path(__file__).parent/'deploy-front.sh').read_text()
            script = script.replace('/opt/stock-release', str(root/'release')).replace('/var/lock', str(root))
            (root/'deploy-front.sh').write_text(script)
            (root/'maintenance.py').write_text('fixture')
            (root/'mocks.sh').write_text(r'''
docker() {
  echo "docker $*" >> "$TEST_LOG"
  case "$*" in
    "pull "*) [[ "$FAIL" != pull ]] || return 1 ;;
    "run --rm "*) [[ "$FAIL" != config ]] || return 1 ;;
    "inspect --format {{.Id}}"*) echo old-id ;;
    "inspect --format {{.Image}}"*) echo old-image ;;
    "inspect "*) echo '[]' ;;
  esac
}
python3() {
  case "$*" in
    *--validate*) [[ "$FAIL" != runtime ]] || return 1 ;;
    *front-config.py*) echo 'start-new' >> "$TEST_LOG"; [[ "$FAIL" != start ]] || return 1 ;;
    *maintenance.py*) echo '{"applied":true}' ;;
    *) echo 8187 ;;
  esac
}
curl() { [[ "$FAIL" != smoke ]]; }
flock() { return 0; }
sleep() { return 0; }
export -f docker python3 curl flock sleep
''')
            env = dict(os.environ, BASH_ENV=str(root/'mocks.sh'), TEST_LOG=str(root/'calls'), FAIL=failure, RELEASE_SHA='a'*40)
            result = subprocess.run(['bash', str(root/'deploy-front.sh')], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
            return result, (root/'calls').read_text()

    def test_pull_or_precheck_failure_never_stops_old_frontend(self):
        for failure in ('pull', 'config', 'runtime'):
            result, calls = self.run_release(failure)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('docker stop', calls)

    def test_failed_start_or_health_restores_old_frontend(self):
        for failure in ('start', 'smoke'):
            result, calls = self.run_release(failure)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('docker rename old-id stock-front', calls)
            self.assertIn('docker start old-id', calls)

    def test_success_preserves_previous_until_health_passes(self):
        result, calls = self.run_release('none')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('docker rename stock-front stock-front-previous-', calls)
        self.assertNotIn('docker rm', calls)
        self.assertNotIn('docker start old-id', calls)


if __name__ == '__main__':
    unittest.main()
