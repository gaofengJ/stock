#!/usr/bin/python3
"""Create and retain checked local MySQL snapshots. Off-host copying is separate."""
import argparse
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import re

ROOT = Path('/srv/stock/backups/daily')
COMPOSE = ['docker', 'compose', '--env-file', '/opt/stock/deploy/release.env',
           '-f', '/opt/stock/deploy/compose.database.yaml']
CLIENT = COMPOSE + ['exec', '-T', 'mysql', 'mysql',
                    '--defaults-extra-file=/run/secrets/mysql-root-client',
                    '--batch', '--skip-column-names']
RESERVE = 6 * 1024**3
RUN_RESERVE = 4 * 1024**3


def restore_proof_matches(metadata, proof):
    if not isinstance(metadata, dict) or not isinstance(proof, dict):
        return False
    return (metadata.get('database') == 'stock' and str(metadata.get('version', '')).startswith('8.4.')
            and proof.get('state') == 'backup-restore-verified'
            and re.fullmatch('[0-9a-f]{64}', str(metadata.get('sha256', ''))) is not None
            and proof.get('sha256') == metadata['sha256'])


def preserve_restore_proof(folder, archive):
    path = folder / 'restore-validation.json'
    if not path.exists():
        return
    metadata = json.loads((folder / 'backup.json').read_text())
    proof = json.loads(path.read_text())
    if not restore_proof_matches(metadata, proof):
        raise ValueError('Invalid restore proof; retain original snapshot for inspection')
    archive.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = archive / (folder.name + '.json')
    temporary = archive / (folder.name + '.tmp')
    temporary.write_text(json.dumps({'backup': metadata, 'proof': proof}, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(target)


def query(sql):
    return subprocess.check_output(CLIENT, input=sql.encode()).decode().strip()


def wait_for_lock(lock, timeout=600):
    deadline = time.monotonic() + timeout
    while True:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return
        except BlockingIOError:
            if time.monotonic() >= deadline:
                raise TimeoutError('Maintenance lock busy; preserve backups and retry later') from None
            time.sleep(5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--keep-all', action='store_true', help='Preserve every existing backup during repair')
    args = parser.parse_args()
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Every future schema migration and release must share this maintenance lock.
    with open('/run/lock/stock-maintenance.lock', 'a') as lock:
        wait_for_lock(lock)
        version = query('SELECT VERSION();')
        assert version.startswith('8.4.'), 'Unexpected target database engine'
        assert query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='stock' AND TABLE_TYPE='BASE TABLE' AND ENGINE<>'InnoDB';") == '0', 'Snapshot requires InnoDB tables'
        assert int(query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='stock';")) > 0
        if shutil.disk_usage(ROOT).free < RESERVE:
            raise RuntimeError('Less than 6 GiB free; preserve existing backups and alert')
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        folder = ROOT / stamp
        folder.mkdir(mode=0o700)
        archive = folder / 'stock.sql.gz'
        started = time.monotonic()
        command = COMPOSE + ['exec', '-T', 'mysql', 'mysqldump',
                             '--defaults-extra-file=/run/secrets/mysql-root-client',
                             '--single-transaction', '--skip-lock-tables', '--quick',
                             '--hex-blob', '--routines', '--events', '--triggers',
                             '--set-gtid-purged=OFF', '--no-tablespaces',
                             '--column-statistics=0', '--default-character-set=utf8mb4', 'stock']
        with (folder / 'dump.stderr').open('wb') as errors:
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors)
            try:
                with gzip.open(archive, 'wb', compresslevel=1) as output:
                    for block in iter(lambda: process.stdout.read(1024 * 1024), b''):
                        if shutil.disk_usage(ROOT).free < RUN_RESERVE:
                            raise RuntimeError('Disk reserve reached; incomplete backup retained for inspection')
                        output.write(block)
                assert process.wait() == 0, 'mysqldump failed; existing backups retained'
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait()
        digest = hashlib.sha256()
        with archive.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        with gzip.open(archive, 'rb') as stream:
            for _ in iter(lambda: stream.read(1024 * 1024), b''):
                pass
        record = {'database': 'stock', 'version': version,
                  'completedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                  'bytes': archive.stat().st_size, 'sha256': digest.hexdigest(),
                  'seconds': round(time.monotonic() - started, 1),
                  'singleTransaction': True, 'offHostVerified': False}
        (folder / 'backup.json').write_text(json.dumps(record, indent=2) + '\n')
        # Delete only this tool's fully completed, older snapshots, after a new valid snapshot exists.
        completed = sorted(p.parent for p in ROOT.glob('????????T??????Z/backup.json'))
        for old in ([] if args.keep_all else completed[:-2]):
            if old != folder:
                preserve_restore_proof(old, ROOT.parent / 'restore-proofs')
                shutil.rmtree(old)
        print(json.dumps({'backup': str(folder), 'bytes': record['bytes'],
                          'sha256': record['sha256'], 'seconds': record['seconds'],
                          'offHostVerified': False}))


if __name__ == '__main__':
    main()
