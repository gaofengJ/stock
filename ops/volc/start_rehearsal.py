#!/usr/bin/python3
"""Start the isolated application only after exact snapshot upgrade validation."""
import json
import os
from pathlib import Path
import subprocess
import time

DEPLOY = Path('/opt/stock/deploy')
BACKUP = Path('/srv/stock/backups/rehearsal-20261014')
TOOLS = Path('/root/migration-tools')
COMPOSE = ['docker', 'compose', '--env-file', str(DEPLOY / 'release.env'),
           '-f', str(DEPLOY / 'compose.app.yaml')]


def main():
    os.umask(0o077)
    assert not Path('/etc/stock/production.enabled').exists()
    assert Path('/srv/stock/state/maintenance').exists()
    report = json.loads((BACKUP / 'mysql84-validation.json').read_text())
    assert report['version'] == '8.4.11' and report['columnsMatch']
    assert report['productionEnabled'] is False and len(report['rows']) == 53
    subprocess.run(['python3', str(DEPLOY / 'check_stack.py'), '--env-file', str(DEPLOY / 'release.env')], check=True)
    (BACKUP / 'application-started').open('x').close()
    subprocess.run(COMPOSE + ['up', '-d', '--pull', 'never', 'back'], check=True)
    cid = subprocess.check_output(COMPOSE + ['ps', '-q', 'back']).decode().strip()
    assert cid
    for _ in range(60):
        state = json.loads(subprocess.check_output(['docker', 'inspect', cid]))[0]['State']
        if state.get('Health', {}).get('Status') == 'healthy':
            break
        if state.get('Status') in ('exited', 'dead'):
            raise RuntimeError('Backend exited; keep maintenance and inspect private logs')
        time.sleep(5)
    else:
        raise TimeoutError('Backend did not become healthy; do not open traffic')
    subprocess.run(COMPOSE + ['up', '-d', '--pull', 'never', 'articles'], check=True)
    time.sleep(2)
    with (BACKUP / 'api-smoke.stdout').open('wb') as stdout, (BACKUP / 'api-smoke.stderr').open('wb') as stderr:
        result = subprocess.run(COMPOSE + ['exec', '-T', 'back', 'node'],
                                input=(TOOLS / 'smoke_rehearsal.cjs').read_bytes(),
                                stdout=stdout, stderr=stderr, timeout=300)
    assert result.returncode == 0, 'API smoke failed; inspect private api-smoke.stderr and keep maintenance'
    smoke = json.loads((BACKUP / 'api-smoke.stdout').read_text().strip())
    assert smoke['qaAccountRemoved'] and smoke['notebookImageRoundTrip'] and smoke['articlesPrivate']
    temp = BACKUP / 'application-validation.json.tmp'
    temp.write_text(json.dumps(smoke, indent=2) + '\n')
    temp.replace(BACKUP / 'application-validation.json')
    print(json.dumps({'state': 'isolated-application-api-verified', 'apiChecks': len(smoke['checks']),
                      'qaAccountRemoved': True, 'productionEnabled': False, 'publicMaintenance': True}), flush=True)


if __name__ == '__main__':
    main()
