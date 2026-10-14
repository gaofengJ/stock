#!/usr/bin/python3
"""Root-owned application-only deployment; no uploaded scripts, DDL, data restore or shell."""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from release_contract import validate_master_head, MAX_BYTES, validate_request, public_request, validate_run

DEPLOY = Path('/opt/stock/deploy')
ENV = DEPLOY / 'release.env'
QUEUE = Path('/run/stock-cd/queue')
CLAIMED = Path('/run/stock-cd/claimed')
STATUS = Path('/srv/stock/deploy-status')
MAINTENANCE = Path('/srv/stock/state/maintenance')
PRODUCTION = Path('/etc/stock/production.enabled')
ENABLED = Path('/srv/stock/state/cd.enabled')
REGISTRY = 'registry.cn-hangzhou.aliyuncs.com'


def run(command, **kwargs):
    return subprocess.check_output(command, stderr=subprocess.PIPE, timeout=kwargs.pop('timeout', 180), **kwargs)


def compose(production, env=ENV):
    command = ['docker', 'compose', '--env-file', str(env), '-f', str(DEPLOY / 'compose.app.yaml')]
    if production:
        command += ['-f', str(DEPLOY / 'compose.production.yaml')]
    return command


def verify_ci(request, rehearsal):
    url = 'https://api.github.com/repos/gaofengJ/stock/actions/runs/' + str(request['runId'])
    req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'stock-release-controller'})
    with urllib.request.urlopen(req, timeout=20) as response:
        validate_run(json.load(response), request, rehearsal)
    if not rehearsal:
        req = urllib.request.Request('https://api.github.com/repos/gaofengJ/stock/commits/master',
                                     headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'stock-release-controller'})
        with urllib.request.urlopen(req, timeout=20) as response:
            validate_master_head(json.load(response), request)


def pull_and_verify(request, pull):
    roles = ('back', 'front') + (('article',) if 'articleDigest' in request else ())
    if pull:
        with tempfile.TemporaryDirectory(prefix='registry-', dir='/run/stock-cd') as auth:
            environment = dict(os.environ, DOCKER_CONFIG=auth)
            run(['docker', 'login', REGISTRY, '-u', request['registryUsername'], '--password-stdin'],
                input=request['registryPassword'].encode(), env=environment, timeout=60)
            for role in roles:
                run(['docker', 'pull', request[role + 'Digest']], env=environment, timeout=600)
    for role in roles:
        digest = request[role + 'Digest']
        image = json.loads(run(['docker', 'image', 'inspect', digest]))[0]
        actual = image['Id']
        if actual != request[role + 'ImageId']:
            manifest = json.loads(run(['ctr', '--namespace', 'moby', 'content', 'get', actual]))
            actual = manifest['config']['digest']
        if actual != request[role + 'ImageId'] or digest not in image['RepoDigests']:
            raise ValueError('Pulled image differs from tested image')


def check_schema(request):
    # Candidate code runs without network, mounts or secrets, only to list declared migration names.
    script = "const d=require('./dist/migration-data-source').default;console.log(JSON.stringify(d.options.migrations.map(m=>m.name).sort()))"
    output = run(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                  '--security-opt', 'no-new-privileges', '--entrypoint', 'node', request['backDigest'], '-e', script])
    expected = json.loads(output.decode().strip().splitlines()[-1])
    history = run(['docker', 'exec', 'mufengtongxue-stock-db-mysql-1', 'mysql',
                   '--defaults-extra-file=/run/secrets/mysql-root-client', '-NB', '-e',
                   'SELECT name FROM stock.migrations ORDER BY name;']).decode().splitlines()
    if not expected or sorted(history) != expected:
        raise ValueError('Schema change or incompatible rollback requires a separate reviewed migration')


def check_backup():
    now = dt.datetime.now(dt.timezone.utc)
    valid = []
    for path in Path('/srv/stock/backups/daily').glob('*/backup.json'):
        try:
            meta = json.loads(path.read_text())
            age = (now - dt.datetime.fromisoformat(meta['completedAt'])).total_seconds()
            if (0 <= age <= 36 * 3600 and meta['database'] == 'stock' and meta['singleTransaction']
                    and (path.parent / 'stock.sql.gz').stat().st_size == meta['bytes']):
                valid.append(path)
        except (ValueError, KeyError, TypeError, OSError):
            continue
    proofs = []
    for proof in Path('/srv/stock/backups/daily').glob('*/restore-validation.json'):
        try:
            metadata = json.loads((proof.parent / 'backup.json').read_text())
            value = json.loads(proof.read_text())
            if value.get('state') == 'backup-restore-verified' and value.get('sha256') == metadata.get('sha256'):
                proofs.append(proof)
        except (ValueError, OSError):
            continue
    if not valid or not proofs:
        raise ValueError('Fresh verified backup and restore proof are required')


def healthy(production):
    for _ in range(60):
        state = json.loads(run(['docker', 'inspect', 'mufengtongxue-stock-back-1']))[0]['State']
        if state.get('Health', {}).get('Status') == 'healthy':
            break
        if state['Status'] in ('dead', 'exited'):
            raise RuntimeError('Backend exited')
        time.sleep(3)
    else:
        raise TimeoutError('Backend health deadline exceeded')
    # Refresh the upstream address after a backend container replacement before probing authorization.
    run(compose(production) + ['exec', '-T', 'articles', 'nginx', '-t'])
    run(compose(production) + ['exec', '-T', 'articles', 'nginx', '-s', 'reload'])
    for url, expected in [('http://127.0.0.1:8081/', 200), ('http://127.0.0.1:3000/api/auth/me', 401), ('http://127.0.0.1:8082/', 403)]:
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                code = response.status
        except urllib.error.HTTPError as error:
            code = error.code
        if code != expected:
            raise ValueError('Read-only health check failed')


def apply(text, production):
    temporary = DEPLOY / 'release.env.next'
    temporary.write_text(text)
    temporary.chmod(0o644)
    args = ['python3', str(DEPLOY / 'check_stack.py'), '--env-file', str(temporary)]
    run(args + (['--production'] if production else []))
    temporary.replace(ENV)
    run(compose(production) + ['up', '-d', '--no-deps', '--pull', 'never', 'back', 'front', 'articles'])
    healthy(production)


def deploy(request, identity, rehearsal=False, dry_run=False):
    production = not rehearsal
    if rehearsal:
        if PRODUCTION.exists() or not MAINTENANCE.is_file():
            raise ValueError('Rehearsal requires isolated maintenance mode')
    elif not all(p.is_file() for p in (PRODUCTION, ENABLED)):
        raise ValueError('Production CD is disabled')
    elif MAINTENANCE.exists():
        raise ValueError('Another maintenance operation is active')
    verify_ci(request, rehearsal)
    check_backup()
    reserve = (8 if 'articleDigest' in request else 4) * 1024**3
    if shutil.disk_usage(DEPLOY).free < reserve:
        raise ValueError('Insufficient free space to stage the verified release')
    pull_and_verify(request, pull=not dry_run)
    if shutil.disk_usage(DEPLOY).free < 4 * 1024**3:
        raise ValueError('Image staging consumed the disk reserve; services remain unchanged')
    # Discard authentication before parsing images or writing durable deployment history.
    request['registryPassword'] = request['registryUsername'] = ''
    check_schema(request)
    previous = ENV.read_text()
    previous_values = dict(line.split('=', 1) for line in previous.splitlines() if line and not line.startswith('#'))
    values = dict(previous_values)
    values.update(BACK_IMAGE=request['backDigest'], FRONT_IMAGE=request['frontDigest'], RELEASE_SHA=request['commit'])
    if 'articleDigest' in request:
        values['ARTICLE_IMAGE'] = request['articleDigest']
    candidate = ''.join(key + '=' + value + '\n' for key, value in values.items())
    if dry_run:
        return {'id': identity, 'state': 'preflight-passed', 'commit': request['commit'], 'databaseChanged': False}
    if all(values[key] == previous_values.get(key)
           for key in ('BACK_IMAGE', 'FRONT_IMAGE', 'ARTICLE_IMAGE', 'RELEASE_SHA') if key in values):
        return {'id': identity, 'state': 'already-current', 'commit': request['commit'], 'databaseChanged': False}
    # Pull/schema validation can take minutes; fail before changing services if superseded or disabled.
    if not rehearsal:
        if not all(p.is_file() for p in (PRODUCTION, ENABLED)) or MAINTENANCE.exists():
            raise ValueError('Production deployment was disabled during preflight')
        verify_ci(request, rehearsal)
    history = DEPLOY / 'releases' / ('cd-' + identity)
    history.mkdir(mode=0o700)
    (history / 'previous.env').write_text(previous)
    (history / 'candidate.env').write_text(candidate)
    (history / 'request.json').write_text(json.dumps(public_request(request), indent=2) + '\n')
    created_maintenance = not MAINTENANCE.exists()
    if created_maintenance:
        MAINTENANCE.touch(mode=0o644)
    try:
        apply(candidate, production)
    except BaseException:
        try:
            apply(previous, production)
        except BaseException:
            (history / 'rollback-failed').touch()
            # Preserve maintenance if both deployment and rollback fail.
            raise RuntimeError('Deployment and rollback failed; maintenance retained') from None
        if created_maintenance:
            MAINTENANCE.unlink()
        (history / 'rollback-healthy').touch()
        raise RuntimeError('Deployment failed; previous application restored') from None
    if created_maintenance:
        MAINTENANCE.unlink()
    report = {'id': identity, 'state': 'deployed', 'commit': request['commit'],
              'databaseChanged': False, 'production': production,
              'completedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
    (history / 'deployment.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def write_status(identity, result):
    fd, path = tempfile.mkstemp(prefix='.status-', dir=STATUS)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(result, stream); stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        os.chmod(path, 0o644)
        os.replace(path, STATUS / (identity + '.json'))
    finally:
        if os.path.exists(path):
            os.unlink(path)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--rehearsal', type=Path, help='Root-operated request file; cannot enable production')
    parser.add_argument('--apply', action='store_true', help='Apply on the isolated new host instead of read-only preflight')
    args = parser.parse_args()
    if args.apply and not args.rehearsal:
        parser.error('--apply requires --rehearsal')
    if not args.rehearsal and not all(p.is_file() for p in (PRODUCTION, ENABLED)):
        print(json.dumps({'state': 'deferred_until_cutover'})); return
    with open('/run/lock/stock-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.rehearsal:
            identity = uuid.uuid4().hex
            with args.rehearsal.open('rb') as stream:
                raw = stream.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError('Request exceeds limit')
            request = validate_request(json.loads(raw))
            print(json.dumps(deploy(request, identity, rehearsal=True, dry_run=not args.apply)))
            return
        for entry in sorted(QUEUE.glob('*.json'))[:1]:
            identity = entry.stem
            if not re.fullmatch(r'[a-f0-9]{32}', identity) or entry.is_symlink():
                raise ValueError('Invalid queued request path')
            claimed = CLAIMED / entry.name
            entry.replace(claimed)
            try:
                with claimed.open('rb') as stream:
                    raw = stream.read(MAX_BYTES + 1)
                claimed.unlink()
                if len(raw) > MAX_BYTES:
                    raise ValueError('Request exceeds limit')
                request = validate_request(json.loads(raw))
                result = deploy(request, identity)
            except Exception as error:
                result = {'id': identity, 'state': 'failed', 'errorType': type(error).__name__,
                          'action': 'Inspect server deployment record; do not retry automatically'}
            finally:
                claimed.unlink(missing_ok=True)
            write_status(identity, result)
            print(json.dumps(result))


if __name__ == '__main__':
    main()
