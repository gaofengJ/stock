#!/usr/bin/python3
"""Deploy locally verified ACR candidates and exercise application-only rollback."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request

DEPLOY = Path('/opt/stock/deploy')
ENV = DEPLOY / 'release.env'
COMPOSE = ['docker', 'compose', '--env-file', str(ENV), '-f', str(DEPLOY / 'compose.app.yaml')]


def apply(text):
    temporary = DEPLOY / 'release.env.next'
    temporary.write_text(text)
    temporary.chmod(0o644)
    subprocess.run(['python3', str(DEPLOY / 'check_stack.py'), '--env-file', str(temporary)], check=True)
    temporary.replace(ENV)
    subprocess.run(COMPOSE + ['up', '-d', '--no-deps', '--pull', 'never', 'back', 'front'], check=True)
    for _ in range(60):
        state = json.loads(subprocess.check_output(['docker', 'inspect', 'mufengtongxue-stock-back-1']))[0]['State']
        if state.get('Health', {}).get('Status') == 'healthy':
            break
        if state['Status'] in ('dead', 'exited'):
            raise RuntimeError('Backend exited')
        time.sleep(3)
    else:
        raise TimeoutError('Backend did not become healthy')
    with urllib.request.urlopen('http://127.0.0.1:8081', timeout=10) as response:
        assert response.status == 200


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--ops-commit', required=True)
    args = parser.parse_args()
    assert re.fullmatch('[a-f0-9]{40}', args.ops_commit)
    assert not Path('/etc/stock/production.enabled').exists()
    assert Path('/srv/stock/state/maintenance').exists()
    assert subprocess.run(['systemctl', 'is-active', '--quiet', 'stock-backup-proof.service']).returncode in (3, 4)
    assert list(Path('/srv/stock/backups/daily').glob('*/restore-validation.json')), 'Backup recovery must pass first'
    with open('/run/lock/stock-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        receipt = args.receipt.resolve()
        sha = (receipt / 'commit').read_text().strip()
        assert re.fullmatch('[a-f0-9]{40}', sha)
        values = dict(line.split('=', 1) for line in ENV.read_text().splitlines() if line and not line.startswith('#'))
        assert values['RELEASE_SHA'] != sha, 'Already deployed; do not repeat the rollback drill'
        previous = ENV.read_text()
        for role in ('back', 'front'):
            digest = (receipt / (role + '-digest')).read_text().strip()
            expected = (receipt / (role + '-image-id')).read_text().strip()
            assert re.fullmatch('sha256:[a-f0-9]{64}', expected)
            assert re.fullmatch('registry.cn-hangzhou.aliyuncs.com/mufengtongxue/stock-' + role + '@sha256:[a-f0-9]{64}', digest)
            info = json.loads(subprocess.check_output(['docker', 'image', 'inspect', digest]))[0]
            actual = info['Id']
            if actual != expected:
                manifest = json.loads(subprocess.check_output(['ctr', '--namespace', 'moby', 'content', 'get', actual]))
                assert manifest['config']['digest'] == expected
            assert digest in info['RepoDigests']
            values[role.upper() + '_IMAGE'] = digest
        values.update(RELEASE_SHA=sha, OPS_SHA=args.ops_commit)
        candidate = ''.join(key + '=' + value + '\n' for key, value in values.items())
        history = DEPLOY / 'releases' / sha
        history.mkdir(parents=True, exist_ok=False, mode=0o700)
        (history / 'previous.env').write_text(previous)
        (history / 'candidate.env').write_text(candidate)
        started = time.monotonic()
        try:
            apply(candidate)
            apply(previous)
            (history / 'rollback-healthy').write_text('Application rollback passed; database untouched.\n')
            apply(candidate)
            with (history / 'api-smoke.stdout').open('wb') as out, (history / 'api-smoke.stderr').open('wb') as err:
                subprocess.run(COMPOSE + ['exec', '-T', 'back', 'node'],
                               input=Path('/root/migration-tools/smoke_rehearsal.cjs').read_bytes(),
                               stdout=out, stderr=err, timeout=300, check=True)
            smoke = json.loads((history / 'api-smoke.stdout').read_text())
            assert smoke['qaAccountRemoved'] and smoke['notebookImageRoundTrip'] and smoke['articlesPrivate']
            result = {'state': 'rehearsal-deployed', 'commit': sha, 'rollbackHealthy': True,
                      'apiChecks': len(smoke['checks']), 'qaAccountRemoved': True,
                      'productionEnabled': False, 'seconds': round(time.monotonic() - started, 1)}
            (history / 'deployment.json').write_text(json.dumps(result, indent=2) + '\n')
            print(json.dumps(result), flush=True)
        except BaseException:
            # No schema changes occur in this deployment. Preserve previous image references.
            apply(previous)
            raise


if __name__ == '__main__':
    main()
