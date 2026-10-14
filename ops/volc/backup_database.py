#!/usr/bin/python3
"""Create and retain checked local MySQL snapshots. Off-host copying is separate."""
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

ROOT = Path('/srv/stock/backups/daily')
COMPOSE = ['docker', 'compose', '--env-file', '/opt/stock/deploy/release.env',
           '-f', '/opt/stock/deploy/compose.database.yaml']
CLIENT = COMPOSE + ['exec', '-T', 'mysql', 'mysql',
                    '--defaults-extra-file=/run/secrets/mysql-root-client',
                    '--batch', '--skip-column-names']
RESERVE = 8 * 1024**3


def query(sql):
    return subprocess.check_output(CLIENT, input=sql.encode()).decode().strip()


def main():
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Every future schema migration and release must share this maintenance lock.
    with open('/run/lock/stock-maintenance.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        version = query('SELECT VERSION();')
        assert version.startswith('8.4.'), 'Unexpected target database engine'
        assert query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='stock' AND TABLE_TYPE='BASE TABLE' AND ENGINE<>'InnoDB';") == '0', 'Snapshot requires InnoDB tables'
        assert int(query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='stock';")) > 0
        if shutil.disk_usage(ROOT).free < RESERVE:
            raise RuntimeError('Less than 8 GiB free; preserve existing backups and alert')
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
                        if shutil.disk_usage(ROOT).free < 2 * 1024**3:
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
        for old in completed[:-2]:
            if old != folder:
                shutil.rmtree(old)
        print(json.dumps({'backup': str(folder), 'bytes': record['bytes'],
                          'sha256': record['sha256'], 'seconds': record['seconds'],
                          'offHostVerified': False}))


if __name__ == '__main__':
    main()
