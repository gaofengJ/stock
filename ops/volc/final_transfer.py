#!/usr/bin/env python3
"""Plan or explicitly transfer final SQL using existing raw baselines; never restore DBs."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import time
from final_export import DATABASES, stream_hash
from final_import import validate_manifest

BASE = Path('/Users/bytedance/Documents/Codex/2026-10-14/private-migration-data')
OLD_HOST = 'root@47.99.111.167'
NEW_HOST = 'root@14.103.103.4'
OLD_SSH = ['ssh', '-S', '/tmp/codex-stock-old-20261014.sock', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=20']
NEW_SSH = ['ssh', '-i', '/Users/bytedance/.ssh/codex-stock-volc-20261014', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=20']
BASELINES = {'stock': 'delta-measurement-20261014', 'stock_test': 'delta-test-measurement-20261014'}
NEW_BASELINE = '/srv/stock/backups/final-sync-baseline-20261014'


def remote(ssh, host, code):
    return subprocess.check_output(ssh + [host, 'python3 -'], input=code.encode(), stderr=subprocess.PIPE).decode()


def prepare_proof(manifest, window):
    # Validate the source contract before any path or copy is used. Real copy proof is constructed only after both hashes pass.
    template = {'state': 'final-transport-verified', 'windowId': window, 'databases': {}}
    for db in DATABASES:
        row = manifest.get('databases', {}).get(db, {})
        template['databases'][db] = dict(sha256=row.get('sha256'), bytes=row.get('bytes'),
                                       operatorCopyVerified=True, newHostCopyVerified=True)
    validate_manifest(manifest, template, window)


def rsync(source, destination, ssh, limit, log):
    with log.open('wb') as output:
        subprocess.run(['rsync', '-rtz', '--inplace', '--partial', '--stats', '--bwlimit=' + str(limit),
                        '-e', ' '.join(shlex.quote(arg) for arg in ssh), source, destination],
                       stdout=output, stderr=output, check=True)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--window-id', required=True)
    parser.add_argument('--transfer', action='store_true', help='Requires approved final export and new-host approval; no automatic retry')
    args = parser.parse_args()
    if not re.fullmatch(r'\d{8}T\d{6}Z', args.window_id):
        parser.error('Invalid cutover window ID')
    paths = {db: BASE / folder / 'stock.sql' for db, folder in BASELINES.items()}
    if not args.transfer:
        print(json.dumps({'mode': 'plan-only', 'windowId': args.window_id, 'databaseChanged': False,
                          'localBaselinesPresent': {db: path.is_file() for db, path in paths.items()},
                          'oldToLocalKiBps': 128, 'localToNewKiBps': 2048,
                          'source': '/opt/stock-migration/final-' + args.window_id,
                          'newDestination': '/srv/stock/backups/final-' + args.window_id})); return
    with (BASE / 'final-transfer.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        old = '/opt/stock-migration/final-' + args.window_id
        new = '/srv/stock/backups/final-' + args.window_id
        source_json = remote(OLD_SSH, OLD_HOST, "from pathlib import Path\nprint(Path(" + repr(old + '/manifest.json') + ").read_text())")
        manifest = json.loads(source_json); prepare_proof(manifest, args.window_id)
        local = BASE / ('final-' + args.window_id)
        # No ambiguous automatic resume: an existing directory needs inspection of its saved state.
        if local.exists():
            raise ValueError('This final transfer was already started; inspect it, do not duplicate')
        required = sum(path.stat().st_size for path in paths.values()) + 1024**3
        if shutil.disk_usage(BASE).free < required:
            raise ValueError('Insufficient local space for independently preserved final snapshots')
        local.mkdir(mode=0o700)
        (local / 'manifest.json').write_text(source_json)
        # Copy only local baselines; do not modify any previous source or backup file.
        for db, path in paths.items():
            shutil.copyfile(path, local / (db + '.sql'))
            (local / (db + '.sql')).chmod(0o600)
        # Validate every remote preseed before moving either one. Rename consumes no additional server disk.
        init = '''import json,sys,hashlib,fcntl,os
from pathlib import Path
sys.path.insert(0,'/opt/stock/deploy')
from final_export import validate_approval
validate_approval(Path('/root/stock-cutover-approved.json'),WINDOW)
assert not Path('/etc/stock/production.enabled').exists()
assert Path('/srv/stock/state/maintenance').is_file()
with open('/run/lock/stock-maintenance.lock','a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 baseline=Path(BASELINE); dest=Path(DESTINATION)
 assert not dest.exists(),'Final destination already exists; inspect it before retrying'
 report=json.loads((baseline/'validation.json').read_text())
 assert report['state']=='verified-preseed-only' and report['databaseImported'] is False
 assert {r['database'] for r in report['databases']}=={'stock','stock_test'}
 for item in report['databases']:
  path=baseline/(item['database']+'.sql')
  assert path.is_file() and not path.is_symlink() and path.stat().st_size==item['bytes']
  with path.open('rb') as stream: assert hashlib.file_digest(stream,'sha256').hexdigest()==item['sha256']
 dest.mkdir(mode=0o700)
 (dest/'preseed-assignment.json').write_text(json.dumps({'windowId':WINDOW,'state':'assigning-preseed'}))
 for db in ('stock','stock_test'): (baseline/(db+'.sql')).rename(dest/(db+'.sql'))
 print('Both verified preseeds assigned; no database imported')
'''.replace('WINDOW', repr(args.window_id)).replace('BASELINE', repr(NEW_BASELINE)).replace('DESTINATION', repr(new))
        remote(NEW_SSH, NEW_HOST, init)
        result = {'state': 'final-transport-verified', 'windowId': args.window_id, 'databases': {}, 'databaseImported': False}
        for db in DATABASES:
            started = time.monotonic(); metadata = manifest['databases'][db]
            target = local / (db + '.sql')
            rsync(OLD_HOST + ':' + old + '/' + db + '.sql', str(target), OLD_SSH, 128, local / (db + '-download.log'))
            if target.stat().st_size != metadata['bytes'] or stream_hash(target) != metadata['sha256']:
                raise ValueError('Independent operator copy failed checksum: ' + db)
            rsync(str(target), NEW_HOST + ':' + new + '/' + db + '.sql', NEW_SSH, 2048, local / (db + '-upload.log'))
            check = json.loads(remote(NEW_SSH, NEW_HOST, "import hashlib,json\nfrom pathlib import Path\np=Path(" + repr(new + '/' + db + '.sql') + ")\nwith p.open('rb') as f: print(json.dumps({'bytes':p.stat().st_size,'sha256':hashlib.file_digest(f,'sha256').hexdigest()}))"))
            if check['bytes'] != metadata['bytes'] or check['sha256'] != metadata['sha256']:
                raise ValueError('New-host copy failed checksum: ' + db)
            result['databases'][db] = dict(check, operatorCopyVerified=True, newHostCopyVerified=True,
                                          seconds=round(time.monotonic() - started, 1))
            for suffix in ('-columns.tsv', '-indexes.tsv'):
                filename = db + suffix
                text = remote(OLD_SSH, OLD_HOST, "from pathlib import Path\nprint(Path(" + repr(old + '/' + filename) + ").read_text(),end='')")
                (local / filename).write_text(text)
                remote(NEW_SSH, NEW_HOST, "from pathlib import Path\np=Path(" + repr(new + '/' + filename) + ")\np.write_text(" + repr(text) + ");p.chmod(0o600)")
        validate_manifest(manifest, result, args.window_id)
        for filename, value in [('manifest.json', manifest), ('transport-verification.json', result)]:
            payload = json.dumps(value, indent=2) + '\n'
            (local / filename).write_text(payload)
            remote(NEW_SSH, NEW_HOST, "from pathlib import Path\np=Path(" + repr(new + '/' + filename) + ")\np.write_text(" + repr(payload) + ");p.chmod(0o600)")
        print(json.dumps(result))


if __name__ == '__main__':
    main()
